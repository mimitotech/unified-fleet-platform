/** Chart.js helpers — brand-colored charts matching React dashboard panels */
const MamsCharts = (() => {
  const instances = new Map();

  function brand() {
    return getComputedStyle(document.documentElement).getPropertyValue('--brand').trim() || '#004225';
  }

  function palette() {
    const p = brand();
    return {
      primary: p,
      accent: getComputedStyle(document.documentElement).getPropertyValue('--brand-mid').trim() || '#1a6b45',
      success: '#047857',
      warn: '#b45309',
      danger: '#b91c1c',
      info: '#0369a1',
      muted: '#94a3b8',
      fleet: {
        moving: '#047857',
        idle: '#b45309',
        stopped: '#64748b',
        offline: '#b91c1c',
      },
      severity: {
        critical: '#b91c1c',
        emergency: '#7f1d1d',
        warning: '#b45309',
        info: '#0369a1',
      },
      sources: {
        wialon: p,
        loconav: '#0369a1',
        tracksolid: '#7c3aed',
      },
    };
  }

  function destroy(id) {
    const chart = instances.get(id);
    if (chart) {
      chart.destroy();
      instances.delete(id);
    }
  }

  function destroyAll() {
    instances.forEach((c) => c.destroy());
    instances.clear();
  }

  function ensureChart() {
    return typeof Chart !== 'undefined';
  }

  function doughnut(canvasId, labels, values, colors) {
    if (!ensureChart()) return null;
    destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const chart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: colors,
          borderWidth: 0,
          hoverOffset: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10, family: 'Plus Jakarta Sans' } } },
        },
      },
    });
    instances.set(canvasId, chart);
    return chart;
  }

  function bar(canvasId, labels, datasets, opts = {}) {
    if (!ensureChart()) return null;
    destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const chart = new Chart(canvas, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: opts.horizontal ? 'y' : 'x',
        scales: {
          x: { stacked: !!opts.stacked, grid: { display: false }, ticks: { font: { size: 10 } } },
          y: { stacked: !!opts.stacked, beginAtZero: true, ticks: { font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.05)' } },
        },
        plugins: {
          legend: { display: datasets.length > 1, position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } },
        },
      },
    });
    instances.set(canvasId, chart);
    return chart;
  }

  function line(canvasId, labels, datasets) {
    if (!ensureChart()) return null;
    destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const chart = new Chart(canvas, {
      type: 'line',
      data: { labels, datasets: datasets.map((d) => ({
        ...d,
        tension: 0.35,
        fill: d.fill ?? false,
        borderWidth: 2,
        pointRadius: 2,
        pointHoverRadius: 4,
      })) },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 0 } },
          y: { beginAtZero: true, ticks: { font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.05)' } },
        },
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } },
        },
      },
    });
    instances.set(canvasId, chart);
    return chart;
  }

  function composed(canvasId, labels, barData, lineData, colors) {
    if (!ensureChart()) return null;
    destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            type: 'bar',
            label: barData.label,
            data: barData.data,
            backgroundColor: colors.bar || palette().primary,
            borderRadius: 4,
            order: 2,
          },
          {
            type: 'line',
            label: lineData.label,
            data: lineData.data,
            borderColor: colors.line || palette().accent,
            backgroundColor: colors.line || palette().accent,
            tension: 0.35,
            borderWidth: 2,
            pointRadius: 2,
            order: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 } } },
          y: { beginAtZero: true, ticks: { font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.05)' } },
        },
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } },
        },
      },
    });
    instances.set(canvasId, chart);
    return chart;
  }

  return { doughnut, bar, line, composed, destroy, destroyAll, palette, brand };
})();
