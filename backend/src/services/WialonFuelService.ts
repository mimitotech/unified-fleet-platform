import type { WialonCredentialsInput } from './WialonHierarchyService.js';
import { withWialonClient } from './WialonSessionService.js';
import {
  fuelLiveFromLls,
  mergeLlsWithSensorNames,
  parseWialonFuelSettingsRaw,
  parseWialonLlsBlock,
  type WialonFuelLive,
  type WialonFuelSettings,
  type WialonLlsReading,
} from './wialonFuel.js';
import { subscribeFleetUnitsEvents, parseEventsCheckUpdates } from './wialonEventsService.js';
import { searchUnitsForAccount, accountIdFrom } from './wialonLiveUtils.js';
import type { FuelLevelParamsInput } from './wialonFuelFlags.js';
import { WialonCrudService } from './WialonCrudService.js';

/** 0x1 + 0x2 + 0x4 + trips + counters + sensors */
const EVENTS_DETAIL = 0x27;

export type WialonFleetFuelUnit = {
  unitId: number;
  fuel: WialonFuelLive;
  tripState?: 0 | 1 | 2;
  tripStateLabel?: string;
  speedKmh?: number;
  mileage?: number;
  engineHours?: number;
};

export class WialonFuelService {
  static async getFuelSettings(
    credentials: WialonCredentialsInput,
    unitId: number
  ): Promise<WialonFuelSettings> {
    return withWialonClient(credentials, async (client) => {
      const raw = await client.request<Record<string, unknown>>('unit/get_fuel_settings', {
        itemId: unitId,
      });
      return parseWialonFuelSettingsRaw(raw);
    });
  }

  static async getUnitFuelLive(
    credentials: WialonCredentialsInput,
    unitId: number
  ): Promise<WialonFleetFuelUnit | null> {
    const fleet = await this.getFleetFuelLive(credentials, [unitId]);
    return fleet.find((u) => u.unitId === unitId) ?? null;
  }

  /** Live fuel + trip state from events/check_updates (Wialon FLS). */
  static async getFleetFuelLive(
    credentials: WialonCredentialsInput,
    unitIds?: number[],
    sensByUnit?: Map<number, Array<{ id: number; name: string }>>
  ): Promise<WialonFleetFuelUnit[]> {
    return withWialonClient(credentials, async (client) => {
      let ids = unitIds;
      if (!ids?.length) {
        const accountId = accountIdFrom(credentials);
        if (accountId != null) {
          const items = await searchUnitsForAccount(client, Number(accountId), 500);
          ids = items.map((u) => u.id);
        }
      }
      if (!ids?.length) return [];

      try {
        await subscribeFleetUnitsEvents(client, ids);
      } catch {
        /* subscription may already exist */
      }

      const raw = await client.request<Record<string, unknown>>('events/check_updates', {
        lang: 'en',
        measure: 0,
        detalization: EVENTS_DETAIL,
      });

      const eventsMap = parseEventsCheckUpdates(raw || {});

      const out: WialonFleetFuelUnit[] = [];
      for (const id of ids) {
        const block = raw?.[String(id)] as Record<string, unknown> | undefined;
        const events = eventsMap.get(id);
        let fuel: WialonFuelLive | undefined;

        if (block?.lls) {
          const readings = parseWialonLlsBlock(block.lls);
          const sensDefs = sensByUnit?.get(id) ?? [];
          fuel = fuelLiveFromLls(
            sensDefs.length ? mergeLlsWithSensorNames(readings, sensDefs) : readings,
            sensDefs
          );
        }

        if (!fuel && events?.fuelLls?.length) {
          fuel = fuelLiveFromLls(events.fuelLls, sensByUnit?.get(id) ?? []);
        }

        if (!fuel) continue;

        out.push({
          unitId: id,
          fuel,
          tripState: events?.tripState,
          tripStateLabel: events?.tripStateLabel,
          speedKmh: events?.currSpeed,
          mileage: events?.mileage,
          engineHours: events?.engineHours,
        });
      }
      return out;
    });
  }

  static async updateFuelLevelParams(
    credentials: WialonCredentialsInput,
    unitId: number,
    params: FuelLevelParamsInput
  ) {
    return withWialonClient(credentials, async (client) => {
      return client.request('unit/update_fuel_level_params', { itemId: unitId, ...params });
    });
  }

  static async markFuelEventFalse(
    credentials: WialonCredentialsInput,
    input: {
      unitId: number;
      resourceId: number;
      eventType: 'lls' | 'theft' | 'filling';
      timeFrom: number;
      timeTo: number;
    }
  ) {
    return withWialonClient(credentials, async (client) => {
      return client.request('unit/update_events', {
        events: [
          {
            itemId: input.unitId,
            resourceId: input.resourceId,
            eventType: input.eventType,
            timeFrom: input.timeFrom,
            timeTo: input.timeTo,
            params: { mark: 1 },
          },
        ],
      });
    });
  }

  static async createFuelSensor(
    credentials: WialonCredentialsInput,
    unitId: number,
    input: {
      name: string;
      parameter: string;
      calibration?: Array<{ x: number; a: number; b: number }>;
      description?: string;
    }
  ) {
    return WialonCrudService.upsertSensor(credentials, {
      itemId: unitId,
      id: 0,
      callMode: 'create',
      name: input.name,
      type: 'fuel level',
      param: input.parameter,
      unit: 'L',
      description: input.description ?? 'Fuel level sensor',
      table: input.calibration ?? [{ x: 0, a: 0, b: 0 }],
    });
  }

  static async getCurrentFuelSensors(
    credentials: WialonCredentialsInput,
    unitId: number,
    sensorIds: number[] = []
  ): Promise<Record<string, number>> {
    return withWialonClient(credentials, async (client) => {
      return client.request<Record<string, number>>('unit/calc_last_message', {
        unitId,
        sensors: sensorIds,
        flags: 1,
      });
    });
  }

  static async updateFuelMath(
    credentials: WialonCredentialsInput,
    unitId: number,
    params: { idling: number; urban: number; suburban: number }
  ) {
    return withWialonClient(credentials, async (client) => {
      return client.request('unit/update_fuel_math_params', { itemId: unitId, ...params });
    });
  }

  static async updateFuelRates(
    credentials: WialonCredentialsInput,
    unitId: number,
    params: {
      consSummer: number;
      consWinter: number;
      winterMonthFrom: number;
      winterDayFrom: number;
      winterMonthTo: number;
      winterDayTo: number;
    }
  ) {
    return withWialonClient(credentials, async (client) => {
      return client.request('unit/update_fuel_rates_params', { itemId: unitId, ...params });
    });
  }

  static async registerFuelFilling(
    credentials: WialonCredentialsInput,
    unitId: number,
    params: {
      volume: number;
      cost?: number;
      location?: string;
      description?: string;
      lat?: number;
      lng?: number;
    }
  ) {
    const now = Math.floor(Date.now() / 1000);
    return withWialonClient(credentials, async (client) => {
      return client.request('unit/registry_fuel_filling_event', {
        itemId: unitId,
        date: now,
        volume: params.volume,
        cost: params.cost ?? 0,
        location: params.location ?? '',
        description: params.description ?? '',
        deviation: 0,
        x: params.lng ?? 0,
        y: params.lat ?? 0,
      });
    });
  }

  static parseFuelFromEventsBlock(
    block: Record<string, unknown> | undefined,
    sensDefs: Array<{ id: number; name: string }> = []
  ): WialonLlsReading[] {
    if (!block?.lls) return [];
    return mergeLlsWithSensorNames(parseWialonLlsBlock(block.lls), sensDefs);
  }
}
