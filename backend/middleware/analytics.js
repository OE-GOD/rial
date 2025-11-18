/**
 * Usage analytics and metrics
 */

const events = [];
const MAX_EVENTS = 10000;

/**
 * Track event
 */
function trackEvent(eventType, data = {}) {
    const event = {
        type: eventType,
        timestamp: new Date().toISOString(),
        data: data
    };
    
    events.push(event);
    
    // Keep only recent events
    if (events.length > MAX_EVENTS) {
        events.shift();
    }
    
    console.log(`📊 Event: ${eventType}`, data);
}

/**
 * Get analytics summary
 */
function getAnalyticsSummary(timeRange = 3600000) { // Last hour by default
    const since = Date.now() - timeRange;
    const recentEvents = events.filter(e => new Date(e.timestamp).getTime() > since);
    
    const summary = {
        totalEvents: recentEvents.length,
        byType: {},
        timeRange: timeRange / 1000 / 60 + ' minutes'
    };
    
    recentEvents.forEach(event => {
        summary.byType[event.type] = (summary.byType[event.type] || 0) + 1;
    });
    
    return summary;
}

/**
 * Middleware to track API usage
 */
function analyticsMiddleware(req, res, next) {
    const startTime = Date.now();
    
    // Track request
    trackEvent('api_request', {
        method: req.method,
        path: req.path,
        ip: req.ip
    });
    
    // Track response
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        trackEvent('api_response', {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            duration: duration
        });
    });
    
    next();
}

/**
 * Track claim submission
 */
function trackClaimSubmission(claimType, verified) {
    trackEvent('claim_submitted', {
        claimType,
        verified
    });
}

/**
 * Track fraud detection
 */
function trackFraudDetection(score, indicators) {
    trackEvent('fraud_detected', {
        score,
        indicators: indicators.length
    });
}

/**
 * Get analytics endpoint
 */
function analyticsEndpoint(req, res) {
    const timeRange = parseInt(req.query.timeRange) || 3600000;
    const summary = getAnalyticsSummary(timeRange);
    
    res.json({
        success: true,
        analytics: summary,
        timestamp: new Date().toISOString()
    });
}

module.exports = {
    trackEvent,
    getAnalyticsSummary,
    analyticsMiddleware,
    trackClaimSubmission,
    trackFraudDetection,
    analyticsEndpoint
};

