import { logger } from '../config/logger.js';
/** Surface actionable DB errors even in production (Hostinger hides stacks). */
function publicMessage(err) {
    const msg = err.message || 'Internal server error';
    if (/ER_|access denied|Duplicate entry|syntax|Unknown column|doesn't exist|bind parameters/i.test(msg)) {
        return msg.slice(0, 300);
    }
    if (process.env.NODE_ENV === 'production') {
        return 'Internal server error';
    }
    return msg;
}
export function errorHandler(err, _req, res, _next) {
    logger.error(err.message, err.stack);
    if (!res.headersSent) {
        res.status(500).json({ success: false, error: publicMessage(err) });
    }
}
