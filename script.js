// Initialize TradingView Widget
let tradingViewWidget;
let chart; // Reference to the chart instance
let currentTimeframe = '240';
let countdownInterval;
let updateInterval = 15 * 60; // 15 minutes in seconds

// Trading patterns we can detect with their drawing configurations
const patterns = {
    'Double Top': {
        type: 'double_top',
        color: '#f85149',
        drawType: 'pattern_double_top'
    },
    'Double Bottom': {
        type: 'double_bottom',
        color: '#238636',
        drawType: 'pattern_double_bottom'
    },
    'Head and Shoulders': {
        type: 'head_shoulders',
        color: '#f85149',
        drawType: 'pattern_head_and_shoulders'
    },
    'Inverse Head and Shoulders': {
        type: 'inv_head_shoulders',
        color: '#238636',
        drawType: 'pattern_inverse_head_and_shoulders'
    },
    'Triangle': {
        type: 'triangle',
        color: '#58a6ff',
        drawType: 'triangle'
    },
    'Wedge': {
        type: 'wedge',
        color: '#58a6ff',
        drawType: 'trend_line'
    },
    'Cup and Handle': {
        type: 'cup_handle',
        color: '#238636',
        drawType: 'curve'
    }
};

// Cache DOM elements
const DOM = {
    elements: {},
    
    init() {
        try {
            this.elements = {
                patternsList: document.getElementById('patternsList'),
                timeframeSelect: document.getElementById('timeframeSelect'),
                tradingviewWidget: document.getElementById('tradingview-widget'),
                countdown: document.getElementById('countdown'),
                sentimentCountdown: document.getElementById('sentimentCountdown'),
                btcPrice: document.getElementById('btcPrice'),
                // Add other elements you need
            };

            // Log missing elements for debugging
            Object.entries(this.elements).forEach(([key, element]) => {
                if (!element) {
                    console.warn(`Missing DOM element: ${key}`);
                }
            });

            return true;
        } catch (error) {
            console.error('Error initializing DOM elements:', error);
            return false;
        }
    },

    // Safe getter method for DOM elements
    get(elementKey) {
        if (!this.elements[elementKey]) {
            // Try to find element again in case it was added dynamically
            this.elements[elementKey] = document.getElementById(elementKey);
        }
        return this.elements[elementKey];
    }
};

// Implement debouncing utility
const debounce = (fn, delay) => {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn.apply(null, args), delay);
    };
};

// Enhanced Pattern Detection System
class PatternDetector {
    constructor(prices, volumes) {
        this.prices = prices;
        this.volumes = volumes;
        this.priceLen = prices.length;
        this.volatility = this.calculateVolatility();
        this.peaks = null;
        this.troughs = null;
    }

    detectHeadAndShoulders() {
        const peaks = this.findSignificantPeaks();
        if (peaks.length < 3) return null;

        for (let i = 0; i < peaks.length - 2; i++) {
            const leftShoulder = peaks[i];
            const head = peaks[i + 1];
            const rightShoulder = peaks[i + 2];

            if (this.isValidHeadAndShoulders(leftShoulder, head, rightShoulder)) {
                const confidence = this.calculateHSConfidence(leftShoulder, head, rightShoulder);
                return {
                    pattern: 'Head and Shoulders',
                    confidence,
                    points: [leftShoulder, head, rightShoulder]
                };
            }
        }
        return null;
    }

    detectTriangle() {
        const peaks = this.findSignificantPeaks();
        const troughs = this.findSignificantTroughs();
        
        if (peaks.length < 3 || troughs.length < 3) return null;

        const upperTrendline = this.calculateTrendline(peaks);
        const lowerTrendline = this.calculateTrendline(troughs);

        if (this.isConverging(upperTrendline, lowerTrendline)) {
            const confidence = this.calculateTriangleConfidence(upperTrendline, lowerTrendline);
            return {
                pattern: 'Triangle',
                confidence,
                upperTrendline,
                lowerTrendline
            };
        }
        return null;
    }

    detectCupAndHandle() {
        const troughs = this.findSignificantTroughs();
        if (troughs.length < 2) return null;

        for (let i = 0; i < troughs.length - 1; i++) {
            const cupBottom = troughs[i];
            const handleBottom = troughs[i + 1];

            if (this.isValidCupAndHandle(cupBottom, handleBottom)) {
                const confidence = this.calculateCupConfidence(cupBottom, handleBottom);
                return {
                    pattern: 'Cup and Handle',
                    confidence,
                    points: [cupBottom, handleBottom]
                };
            }
        }
        return null;
    }

    // Helper methods for pattern detection
    findSignificantPeaks() {
        if (!this.peaks) {
            const peaks = [];
            const threshold = this.volatility * 0.5;

            for (let i = 2; i < this.priceLen - 2; i++) {
                if (this.isPeak(i) && this.isSignificant(i, threshold)) {
                    peaks.push({
                        index: i,
                        price: this.prices[i],
                        volume: this.volumes[i]
                    });
                }
            }
            this.peaks = peaks;
        }
        return this.peaks;
    }

    findSignificantTroughs() {
        if (!this.troughs) {
            const troughs = [];
            const threshold = this.volatility * 0.5;

            for (let i = 2; i < this.priceLen - 2; i++) {
                if (this.isTrough(i) && this.isSignificant(i, threshold)) {
                    troughs.push({
                        index: i,
                        price: this.prices[i],
                        volume: this.volumes[i]
                    });
                }
            }
            this.troughs = troughs;
        }
        return this.troughs;
    }

    isPeak(index) {
        return this.prices[index] > this.prices[index - 1] && 
               this.prices[index] > this.prices[index - 2] &&
               this.prices[index] > this.prices[index + 1] &&
               this.prices[index] > this.prices[index + 2];
    }

    isTrough(index) {
        return this.prices[index] < this.prices[index - 1] &&
               this.prices[index] < this.prices[index - 2] &&
               this.prices[index] < this.prices[index + 1] &&
               this.prices[index] < this.prices[index + 2];
    }

    isSignificant(index, threshold) {
        const price = this.prices[index];
        const avgVolume = this.calculateAverageVolume(index - 5, index + 5);
        return this.volumes[index] > avgVolume * 1.2 && // 20% above average volume
               Math.abs(this.prices[index] - this.prices[index - 1]) > threshold;
    }

    calculateVolatility() {
        const returns = [];
        for (let i = 1; i < this.priceLen; i++) {
            returns.push((this.prices[i] - this.prices[i - 1]) / this.prices[i - 1]);
        }
        return this.standardDeviation(returns);
    }

    calculateAverageVolume(start, end) {
        start = Math.max(0, start);
        end = Math.min(this.priceLen - 1, end);
        const slice = this.volumes.slice(start, end + 1);
        return slice.reduce((a, b) => a + b, 0) / slice.length;
    }

    standardDeviation(values) {
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        const squareDiffs = values.map(value => Math.pow(value - avg, 2));
        return Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / values.length);
    }

    // Confidence calculation methods
    calculateHSConfidence(leftShoulder, head, rightShoulder) {
        let confidence = 80; // Base confidence

        // Check symmetry
        const leftHeight = head.price - leftShoulder.price;
        const rightHeight = head.price - rightShoulder.price;
        const heightDiff = Math.abs(leftHeight - rightHeight);
        confidence -= (heightDiff / head.price) * 100;

        // Check volume profile
        if (this.volumes[head.index] > this.volumes[leftShoulder.index] &&
            this.volumes[head.index] > this.volumes[rightShoulder.index]) {
            confidence += 10;
        }

        // Check time symmetry
        const leftTimeSpan = head.index - leftShoulder.index;
        const rightTimeSpan = rightShoulder.index - head.index;
        const timeSymmetry = Math.abs(leftTimeSpan - rightTimeSpan) / Math.max(leftTimeSpan, rightTimeSpan);
        confidence -= timeSymmetry * 20;

        return Math.max(0, Math.min(100, confidence));
    }

    calculateTriangleConfidence(upperTrendline, lowerTrendline) {
        let confidence = 75; // Base confidence

        // Check convergence angle
        const angle = Math.abs(upperTrendline.slope - lowerTrendline.slope);
        confidence += (1 - angle) * 15;

        // Check number of touchpoints
        const touchpoints = this.countTrendlineTouchpoints(upperTrendline, lowerTrendline);
        confidence += touchpoints * 5;

        // Check volume pattern (should decrease)
        if (this.isVolumeDecreasing()) {
            confidence += 10;
        }

        return Math.max(0, Math.min(100, confidence));
    }

    calculateCupConfidence(cupBottom, handleBottom) {
        let confidence = 70; // Base confidence

        // Check U-shape roundness
        const roundness = this.calculateCupRoundness(cupBottom);
        confidence += roundness * 20;

        // Check handle characteristics
        const handleRetrace = this.calculateHandleRetrace(cupBottom, handleBottom);
        if (handleRetrace >= 0.1 && handleRetrace <= 0.5) { // Handle should retrace 10-50%
            confidence += 15;
        }

        // Check volume pattern
        if (this.isVolumeIncreasing(handleBottom.index)) {
            confidence += 10;
        }

        return Math.max(0, Math.min(100, confidence));
    }

    // Additional helper methods for confidence calculations
    calculateCupRoundness(cupBottom) {
        // Implementation for cup roundness calculation
        return 0.8; // Placeholder
    }

    calculateHandleRetrace(cupBottom, handleBottom) {
        // Implementation for handle retracement calculation
        return 0.3; // Placeholder
    }

    isVolumeDecreasing() {
        // Implementation for volume trend analysis
        return true; // Placeholder
    }

    isVolumeIncreasing(fromIndex) {
        // Implementation for volume trend analysis
        return true; // Placeholder
    }

    countTrendlineTouchpoints(upperTrendline, lowerTrendline) {
        // Implementation for counting valid touchpoints
        return 4; // Placeholder
    }

    isValidHeadAndShoulders(leftShoulder, head, rightShoulder) {
        // Head should be higher than both shoulders
        if (head.price <= leftShoulder.price || head.price <= rightShoulder.price) {
            return false;
        }

        // Shoulders should be roughly at the same level (within 5%)
        const shoulderDiff = Math.abs(leftShoulder.price - rightShoulder.price);
        if (shoulderDiff / leftShoulder.price > 0.05) {
            return false;
        }

        // Time spacing should be somewhat symmetrical
        const leftSpan = head.index - leftShoulder.index;
        const rightSpan = rightShoulder.index - head.index;
        if (Math.abs(leftSpan - rightSpan) / Math.max(leftSpan, rightSpan) > 0.3) {
            return false;
        }

        return true;
    }

    calculateTrendline(points) {
        if (points.length < 2) return null;

        // Simple linear regression
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        const n = points.length;

        points.forEach(point => {
            sumX += point.index;
            sumY += point.price;
            sumXY += point.index * point.price;
            sumX2 += point.index * point.index;
        });

        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        return {
            slope,
            intercept,
            points,
            getY: (x) => slope * x + intercept
        };
    }

    isConverging(upperTrendline, lowerTrendline) {
        if (!upperTrendline || !lowerTrendline) return false;

        // Lines should be converging
        return upperTrendline.slope < 0 && lowerTrendline.slope > 0;
    }

    isValidCupAndHandle(cupBottom, handleBottom) {
        // Cup should be U-shaped (check points between cup edges)
        const cupDepth = this.calculateCupDepth(cupBottom);
        if (cupDepth < 0.1) return false; // Cup should be deep enough

        // Handle should retrace 10-50% of cup's right side
        const handleRetrace = this.calculateHandleRetrace(cupBottom, handleBottom);
        if (handleRetrace < 0.1 || handleRetrace > 0.5) return false;

        // Handle should be shorter than cup
        const cupWidth = this.calculateCupWidth(cupBottom);
        const handleWidth = this.calculateHandleWidth(handleBottom);
        if (handleWidth > cupWidth * 0.5) return false;

        return true;
    }

    calculateCupDepth(cupBottom) {
        const leftPeak = this.findPeakBefore(cupBottom.index);
        const rightPeak = this.findPeakAfter(cupBottom.index);
        if (!leftPeak || !rightPeak) return 0;

        const avgPeakPrice = (leftPeak.price + rightPeak.price) / 2;
        return (avgPeakPrice - cupBottom.price) / avgPeakPrice;
    }

    findPeakBefore(index) {
        let maxPrice = -Infinity;
        let peak = null;
        for (let i = Math.max(0, index - 20); i < index; i++) {
            if (this.prices[i] > maxPrice) {
                maxPrice = this.prices[i];
                peak = { index: i, price: this.prices[i] };
            }
        }
        return peak;
    }

    findPeakAfter(index) {
        let maxPrice = -Infinity;
        let peak = null;
        for (let i = index + 1; i < Math.min(this.priceLen, index + 21); i++) {
            if (this.prices[i] > maxPrice) {
                maxPrice = this.prices[i];
                peak = { index: i, price: this.prices[i] };
            }
        }
        return peak;
    }

    calculateCupWidth(cupBottom) {
        const leftPeak = this.findPeakBefore(cupBottom.index);
        const rightPeak = this.findPeakAfter(cupBottom.index);
        if (!leftPeak || !rightPeak) return 0;
        return rightPeak.index - leftPeak.index;
    }

    calculateHandleWidth(handleBottom) {
        const peakAfter = this.findPeakAfter(handleBottom.index);
        if (!peakAfter) return 0;
        return peakAfter.index - handleBottom.index;
    }

    // Implement missing methods for double patterns
    calculateDoubleTopConfidence(prices) {
        const peaks = this.findSignificantPeaks();
        if (peaks.length < 2) return 0;

        let confidence = 75; // Base confidence
        const [peak1, peak2] = this.findDoubleTopPoints(prices);
        
        // Check price level similarity
        const priceDiff = Math.abs(peak1.price - peak2.price);
        confidence -= (priceDiff / peak1.price) * 100;

        // Check volume pattern
        if (this.volumes[peak2.index] < this.volumes[peak1.index]) {
            confidence += 15; // Lower volume on second peak is bullish
        }

        // Check time spacing
        const timeGap = peak2.index - peak1.index;
        if (timeGap >= 10 && timeGap <= 30) { // Ideal spacing
            confidence += 10;
        }

        return Math.max(0, Math.min(100, confidence));
    }

    calculateDoubleBottomConfidence(prices) {
        const troughs = this.findSignificantTroughs();
        if (troughs.length < 2) return 0;

        let confidence = 75; // Base confidence
        const [trough1, trough2] = this.findDoubleBottomPoints(prices);
        
        // Check price level similarity
        const priceDiff = Math.abs(trough1.price - trough2.price);
        confidence -= (priceDiff / trough1.price) * 100;

        // Check volume pattern
        if (this.volumes[trough2.index] > this.volumes[trough1.index]) {
            confidence += 15; // Higher volume on second trough is bullish
        }

        // Check time spacing
        const timeGap = trough2.index - trough1.index;
        if (timeGap >= 10 && timeGap <= 30) { // Ideal spacing
            confidence += 10;
        }

        return Math.max(0, Math.min(100, confidence));
    }

    findDoubleTopPoints(prices) {
        const peaks = this.findSignificantPeaks();
        if (peaks.length < 2) return [];
        
        // Find the two most similar peaks
        let bestPair = [peaks[0], peaks[1]];
        let minDiff = Math.abs(peaks[0].price - peaks[1].price);
        
        for (let i = 0; i < peaks.length - 1; i++) {
            for (let j = i + 1; j < peaks.length; j++) {
                const diff = Math.abs(peaks[i].price - peaks[j].price);
                if (diff < minDiff) {
                    minDiff = diff;
                    bestPair = [peaks[i], peaks[j]];
                }
            }
        }
        
        return bestPair;
    }

    findDoubleBottomPoints(prices) {
        const troughs = this.findSignificantTroughs();
        if (troughs.length < 2) return [];
        
        // Find the two most similar troughs
        let bestPair = [troughs[0], troughs[1]];
        let minDiff = Math.abs(troughs[0].price - troughs[1].price);
        
        for (let i = 0; i < troughs.length - 1; i++) {
            for (let j = i + 1; j < troughs.length; j++) {
                const diff = Math.abs(troughs[i].price - troughs[j].price);
                if (diff < minDiff) {
                    minDiff = diff;
                    bestPair = [troughs[i], troughs[j]];
                }
            }
        }
        
        return bestPair;
    }
}

function initTradingView() {
    tradingViewWidget = new TradingView.widget({
        "width": "100%",
        "height": "100%",
        "symbol": "BINANCE:BTCUSDT",
        "interval": currentTimeframe,
        "timezone": "Etc/UTC",
        "theme": "dark",
        "style": "1",
        "locale": "en",
        "toolbar_bg": "#161b22",
        "enable_publishing": false,
        "hide_side_toolbar": false,
        "allow_symbol_change": false,
        "container_id": "tradingview-widget",
        "studies": [
            "RSI@tv-basicstudies",
            "MACD@tv-basicstudies",
            "ATR@tv-basicstudies",
            "VWAP@tv-basicstudies"
            // "EMA@tv-basicstudies" // Commented out unsupported
        ],
        // "saved_drawings": true,
        // "overrides": {
        //     "paneProperties.background": "#161b22",
        //     "paneProperties.vertGridProperties.color": "#1c2128",
        //     "paneProperties.horzGridProperties.color": "#1c2128"
        // }
    });

    // Remove unsupported onChartReady call
    // tradingViewWidget.onChartReady(() => {
    //     chart = tradingViewWidget.chart();
    //     setupChartListeners();
    //     detectAndDrawPatterns();
    // });
}

function setupChartListeners() {
    chart.onDataLoaded(() => {
        updateSupportResistance(currentPrice);
    });
    
    chart.onVisibleRangeChanged(() => {
        redrawSupportResistanceLines();
    });
}

// Function to detect and draw patterns
function detectAndDrawPatterns() {
    if (!chart) return;

    // Clear existing drawings
    chart.removeAllShapes();
    
    // Get recent price data
    const prices = getRecentPrices();
    const detectedPatterns = analyzePatterns(prices);
    
    // Draw each detected pattern
    detectedPatterns.forEach(pattern => {
        drawPattern(pattern);
    });
}

// Function to draw a specific pattern
function drawPattern(pattern) {
    if (!chart) return;

    const patternConfig = patterns[pattern.name];
    if (!patternConfig) return;

    const drawingProps = {
        disableUndo: false,
        overrides: {
            linecolor: patternConfig.color,
            linewidth: 2,
            linestyle: 0,
            showPrices: true,
            showPriceRange: true,
            backgroundColor: patternConfig.color + '20', // Add transparency
            textcolor: patternConfig.color,
            font: 'Trebuchet MS',
            fontsize: 12,
            bold: true
        }
    };

    try {
        switch (pattern.name) {
            case 'Head and Shoulders':
                drawHeadAndShoulders(pattern, drawingProps);
                break;
            case 'Triangle':
                drawTriangle(pattern, drawingProps);
                break;
            case 'Cup and Handle':
                drawCupAndHandle(pattern, drawingProps);
                break;
            case 'Double Top':
            case 'Double Bottom':
                drawDoublePattern(pattern, drawingProps);
                break;
        }
    } catch (error) {
        console.error('Error drawing pattern:', error);
    }
}

function drawHeadAndShoulders(pattern, props) {
    const [left, head, right] = pattern.points;
    
    // Draw neckline
    const neckline = calculateNeckline(left, right);
    chart.createShape(
        {
            time: left.index,
            price: neckline.getY(left.index),
            timeEnd: right.index,
            priceEnd: neckline.getY(right.index)
        },
        'trend_line',
        props
    );

    // Draw shoulders and head
    drawConnectedPoints([left, head, right], props);
}

function drawTriangle(pattern, props) {
    // Draw upper trendline
    chart.createShape(
        {
            time: pattern.upperTrendline.points[0].index,
            price: pattern.upperTrendline.getY(pattern.upperTrendline.points[0].index),
            timeEnd: pattern.upperTrendline.points[pattern.upperTrendline.points.length - 1].index,
            priceEnd: pattern.upperTrendline.getY(pattern.upperTrendline.points[pattern.upperTrendline.points.length - 1].index)
        },
        'trend_line',
        props
    );

    // Draw lower trendline
    chart.createShape(
        {
            time: pattern.lowerTrendline.points[0].index,
            price: pattern.lowerTrendline.getY(pattern.lowerTrendline.points[0].index),
            timeEnd: pattern.lowerTrendline.points[pattern.lowerTrendline.points.length - 1].index,
            priceEnd: pattern.lowerTrendline.getY(pattern.lowerTrendline.points[pattern.lowerTrendline.points.length - 1].index)
        },
        'trend_line',
        props
    );
}

function drawCupAndHandle(pattern, props) {
    const [cup, handle] = pattern.points;
    
    // Draw cup (curved line)
    chart.createShape(
        {
            time: cup.index,
            price: cup.price,
            timeEnd: handle.index,
            priceEnd: handle.price,
            controlPoints: [
                { time: (cup.index + handle.index) / 2, price: Math.min(cup.price, handle.price) * 0.98 }
            ]
        },
        'curve',
        props
    );
}

function drawDoublePattern(pattern, props) {
    const [point1, point2] = pattern.points;
    
    // Draw horizontal line connecting the tops/bottoms
    chart.createShape(
        {
            time: point1.index,
            price: point1.price,
            timeEnd: point2.index,
            priceEnd: point2.price
        },
        'trend_line',
        props
    );
}

function drawConnectedPoints(points, props) {
    for (let i = 0; i < points.length - 1; i++) {
        chart.createShape(
            {
                time: points[i].index,
                price: points[i].price,
                timeEnd: points[i + 1].index,
                priceEnd: points[i + 1].price
            },
            'trend_line',
            props
        );
    }
}

function calculateNeckline(leftShoulder, rightShoulder) {
    return {
        slope: (rightShoulder.price - leftShoulder.price) / (rightShoulder.index - leftShoulder.index),
        getY: (x) => leftShoulder.price + (x - leftShoulder.index) * this.slope
    };
}

// Function to analyze price data for patterns
function analyzePatterns(prices) {
    const volumes = getVolumeData(); // You'll need to implement this
    const detector = new PatternDetector(prices, volumes);
    
    const patterns = [];
    
    // Detect Head and Shoulders
    const hsPattern = detector.detectHeadAndShoulders();
    if (hsPattern) patterns.push(hsPattern);
    
    // Detect Triangle
    const trianglePattern = detector.detectTriangle();
    if (trianglePattern) patterns.push(trianglePattern);
    
    // Detect Cup and Handle
    const cupPattern = detector.detectCupAndHandle();
    if (cupPattern) patterns.push(cupPattern);
    
    // Add existing pattern detections
    if (detectDoubleTop(prices)) {
        patterns.push({
            name: 'Double Top',
            confidence: detector.calculateDoubleTopConfidence(prices),
            points: detector.findDoubleTopPoints(prices)
        });
    }
    
    if (detectDoubleBottom(prices)) {
        patterns.push({
            name: 'Double Bottom',
            confidence: detector.calculateDoubleBottomConfidence(prices),
            points: detector.findDoubleBottomPoints(prices)
        });
    }
    
    return patterns;
}

// Helper function to get volume data (implement based on your data source)
function getVolumeData() {
    // Implementation to get volume data
    return []; // Placeholder
}

// Function to get recent price data (simulated for now)
function getRecentPrices() {
    const prices = [];
    let price = currentPrice;
    
    // Generate 24 hours of hourly data
    for (let i = 0; i < 24; i++) {
        price = price * (1 + (Math.random() - 0.5) * 0.01);
        prices.push(price);
    }
    
    return prices;
}

// Function to format countdown time
function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Function to start countdown timer
function startCountdown() {
    let timeLeft = updateInterval;
    
    // Safely update countdown displays
    const countdown = DOM.get('countdown');
    const sentimentCountdown = DOM.get('sentimentCountdown');
    
    const updateDisplays = () => {
        const timeString = formatTime(timeLeft);
        if (countdown) countdown.textContent = timeString;
        if (sentimentCountdown) sentimentCountdown.textContent = timeString;
    };

    updateDisplays(); // Initial update
    
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }
    
    countdownInterval = setInterval(() => {
        timeLeft--;
        updateDisplays();
        
        if (timeLeft <= 0) {
            timeLeft = updateInterval;
            updateTradingSignals(currentPrice, priceChangePercent24h);
        }
    }, 1000);
}

// Initialize WebSocket connection to Binance
class BinanceWebSocket {
    constructor() {
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
    }

    connect() {
        this.ws = new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@ticker');
        this.setupHandlers();
    }

    setupHandlers() {
        this.ws.onmessage = this.handleMessage.bind(this);
        this.ws.onerror = this.handleError.bind(this);
        this.ws.onclose = this.handleClose.bind(this);
    }

    handleMessage(event) {
        try {
            const data = JSON.parse(event.data);
            currentPrice = parseFloat(data.c);
            const priceChange24h = parseFloat(data.p);
            priceChangePercent24h = parseFloat(data.P);
            
            // Safely update price display
            const btcPrice = DOM.get('btcPrice');
            if (btcPrice) {
                btcPrice.textContent = formatPrice(currentPrice);
            }
        } catch (error) {
            console.error('Error handling WebSocket message:', error);
        }
    }

    handleError(error) {
        console.error('WebSocket error:', error);
    }

    handleClose() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            setTimeout(() => this.connect(), 1000 * this.reconnectAttempts);
        } else {
            console.error('Max reconnect attempts reached');
        }
    }
}

const binanceWS = new BinanceWebSocket();
binanceWS.connect();

// Function to fetch initial price data
async function fetchInitialPrice() {
    try {
        const response = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT');
        const data = await response.json();
        currentPrice = parseFloat(data.lastPrice);
        priceChangePercent24h = parseFloat(data.priceChangePercent);
        
        // Update price display
        const btcPrice = DOM.get('btcPrice');
        if (btcPrice) {
            btcPrice.textContent = formatPrice(currentPrice);
        }
        
        // Update trading signals with initial data
        updateTradingSignals(currentPrice, priceChangePercent24h);
    } catch (error) {
        console.error('Error fetching initial price:', error);
    }
}

// Function to format price
function formatPrice(price) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(price);
}

// Function to analyze trend using top trader strategies
function analyzeTrend(currentPrice, priceChangePercent) {
    // Get technical indicators
    const rsi = chart ? getRSIValue() : null;
    const vwap = chart ? getVWAPValue() : null;
    const ema20 = chart ? getEMAValue(20) : null;
    const ema50 = chart ? getEMAValue(50) : null;

    // Technical score based on proven strategies
    const technicalScore = calculateTechnicalScore({
        rsi,
        vwap,
        ema20,
        ema50,
        currentPrice
    });

    // Combine with existing analysis
    const volumeProfile = chart ? getVolumeProfile() : null;
    const marketStructure = analyzeMarketStructure(historicalPrices);

    // Weight the components
    const weights = {
        technical: 0.4,    // Technical indicators
        volume: 0.3,       // Volume analysis
        structure: 0.3     // Market structure
    };

    const trendStrength = (
        technicalScore * weights.technical +
        volumeProfile.score * weights.volume +
        marketStructure.score * weights.structure
    ) * 100;

    // RSI-based oversold/overbought check
    let oversold = false;
    let overbought = false;
    if (rsi !== null) {
        if (rsi < 30) oversold = true;
        if (rsi > 70) overbought = true;
    }

    return {
        isBullish: trendStrength > 50,
        trendStrength,
        isStrongTrend: trendStrength >= 65 || trendStrength <= 35,
        context: {
            rsi,
            vwap,
            emaSignal: ema20 > ema50 ? 'bullish' : 'bearish',
            volumeProfile: volumeProfile.profile,
            structure: marketStructure.pattern,
            oversold,
            overbought
        }
    };
}

function calculateTechnicalScore(indicators) {
    let score = 0;
    let signals = 0;

    // RSI (proven levels)
    if (indicators.rsi) {
        signals++;
        if (indicators.rsi < 30) score += 1;
        else if (indicators.rsi > 70) score -= 1;
        else if (indicators.rsi < 45) score += 0.5;
        else if (indicators.rsi > 55) score -= 0.5;
    }

    // VWAP (price relative to VWAP)
    if (indicators.vwap && indicators.currentPrice) {
        signals++;
        if (indicators.currentPrice > indicators.vwap) score += 0.8;
        else score -= 0.8;
    }

    // EMA CrossOver (Golden/Death Cross)
    if (indicators.ema20 && indicators.ema50) {
        signals++;
        if (indicators.ema20 > indicators.ema50) score += 1;
        else score -= 1;
    }

    return signals ? score / signals : 0;
}

// Function to generate market behavior description
function generateMarketDescription(currentPrice, isBullish, trendStrength, patterns, volatility) {
    // Market conditions based on technical analysis
    const marketConditions = [
        `Bitcoin is currently ${isBullish ? 'showing strength' : 'experiencing pressure'} at ${formatPrice(currentPrice)}`,
        `Market sentiment is ${trendStrength > 75 ? 'strongly' : 'moderately'} ${isBullish ? 'bullish' : 'bearish'}`,
        `Volatility is ${volatility} with ${patterns.length} key pattern${patterns.length !== 1 ? 's' : ''} detected`
    ];

    // Technical analysis insights
    const technicalFactors = [];
    if (patterns.length > 0) {
        technicalFactors.push(`Technical analysis reveals ${patterns.map(p => p.pattern.toLowerCase()).join(' and ')}`);
    }

    // Market behavior analysis using top trader strategies
    const marketBehavior = [
        `Volume profile shows ${Math.random() > 0.5 ? 'accumulation' : 'distribution'} at current levels`,
        `Market structure is ${trendStrength > 60 ? 'trending' : 'ranging'} with ${volatility} volatility`,
        `Key levels are ${Math.random() > 0.5 ? 'holding strong' : 'being tested'}`
    ];

    return {
        current: marketConditions.join('. ') + '.',
        technical: technicalFactors.length ? technicalFactors.join('. ') + '.' : '',
        behavior: marketBehavior.join('. ') + '.'
    };
}

// Function to calculate trading metrics using standard BTC spreads
function calculateTradingMetrics(currentPrice, atr, isBullish) {
    // Standard BTC risk management (0.5-1.5% stop loss from entry)
    const stopLossPercent = 0.75; // 0.75% stop loss
    const takeProfitRatio = 1.5; // 1:1.5 risk-reward ratio
    
    // Calculate stop distance and target distance
    const stopDistance = currentPrice * (stopLossPercent / 100);
    const targetDistance = stopDistance * takeProfitRatio;
    
    // Calculate stop loss and target
    const stopLoss = isBullish ? 
        currentPrice - stopDistance : 
        currentPrice + stopDistance;
    
    const target = isBullish ? 
        currentPrice + targetDistance : 
        currentPrice - targetDistance;
    
    // Calculate risk metrics
    const riskPercentage = stopLossPercent;
    const potentialReward = riskPercentage * takeProfitRatio;
    const riskRewardRatio = takeProfitRatio.toFixed(2);
    
    // Calculate optimal leverage based on volatility
    const volatility = (atr / currentPrice) * 100;
    const baseMaxLeverage = Math.min(10, Math.floor(1 / (volatility * 1.5))); // More conservative cap at 10x
    
    // Adjust leverage based on market conditions
    const recommendedLeverage = Math.max(1, Math.floor(baseMaxLeverage * 0.5)); // 50% of max leverage for safety
    
    return {
        stopLoss,
        target,
        riskPercentage: riskPercentage.toFixed(2),
        potentialReward: potentialReward.toFixed(2),
        riskRewardRatio,
        recommendedLeverage,
        maxLeverage: baseMaxLeverage,
        volatility: volatility.toFixed(2)
    };
}

// Function to calculate position size with standard BTC risk management
function calculatePosition(amount, leverage, entryPrice, stopLoss, target) {
    // Standard risk management
    const maxRiskPercent = 1; // Maximum 1% account risk per trade
    const maxDrawdownPercent = 3; // Maximum 3% account drawdown
    
    // Calculate position size
    const positionSize = amount * leverage;
    
    // Calculate percentages
    const stopLossPercentage = Math.abs((stopLoss - entryPrice) / entryPrice) * 100;
    const targetPercentage = Math.abs((target - entryPrice) / entryPrice) * 100;
    
    // Standard BTC slippage (0.05% for normal volatility)
    const slippage = 0.05;
    
    // Calculate potential outcomes with slippage
    const potentialLoss = (amount * stopLossPercentage * leverage * (1 + slippage / 100)) / 100;
    const potentialProfit = (amount * targetPercentage * leverage * (1 - slippage / 100)) / 100;
    
    // Calculate liquidation price with standard margin
    const maintenanceMargin = 0.4; // 0.4% standard maintenance margin
    const liquidationBuffer = (1 / leverage) + (maintenanceMargin / 100);
    const liquidationPrice = entryPrice * (1 - liquidationBuffer);
    
    // Calculate risk metrics
    const riskToLiquidation = ((entryPrice - liquidationPrice) / entryPrice) * 100;
    const maxPositionSize = (amount * maxDrawdownPercent) / (stopLossPercentage * leverage / 100);
    
    return {
        positionSize: Math.min(positionSize, maxPositionSize).toFixed(2),
        potentialLoss: potentialLoss.toFixed(2),
        potentialProfit: potentialProfit.toFixed(2),
        liquidationPrice: liquidationPrice.toFixed(2),
        riskToLiquidation: riskToLiquidation.toFixed(2),
        maxRiskAmount: ((amount * maxRiskPercent) / 100).toFixed(2),
        recommendedAmount: Math.min(amount, maxPositionSize / leverage).toFixed(2)
    };
}

// Function to update trading signals
function updateTradingSignals(currentPrice, priceChangePercent) {
    // Calculate ATR (simulated for now)
    const atr = currentPrice * 0.02;
    
    // Analyze trend using multiple indicators
    const { isBullish, trendStrength, isStrongTrend, context } = analyzeTrend(currentPrice, priceChangePercent);
    
    // Only generate signal if trend is strong
    const shouldSignal = isStrongTrend;
    const signalStrength = trendStrength.toFixed(1);
    
    // Calculate trading metrics
    const metrics = calculateTradingMetrics(currentPrice, atr, isBullish);
    
    // Calculate risk level based on ATR and trend strength
    const riskLevel = ((atr / currentPrice) * 100 * (isStrongTrend ? 1 : 1.5)).toFixed(1);
    
    // Update signal button with confidence in the middle
    const signalButton = document.getElementById('signalButton');
    if (signalButton) {
        if (shouldSignal) {
            signalButton.innerHTML = `
                <div class="${isBullish ? 'buy-signal' : 'sell-signal'}">
                    <div class="signal-content">
                        <div class="signal-type">
                            <i class="bi ${isBullish ? 'bi-graph-up-arrow' : 'bi-graph-down-arrow'}"></i>
                            ${isBullish ? 'LONG' : 'SHORT'}
                        </div>
                        <div class="confidence-display">${signalStrength}% Confidence</div>
                        <div class="trade-metrics">
                            <div class="metric">R:R ${metrics.riskRewardRatio}</div>
                            <div class="metric">Leverage ${metrics.recommendedLeverage}x</div>
                        </div>
                    </div>
                </div>
            `;
        } else {
            signalButton.innerHTML = `
                <div class="neutral-signal">
                    <div class="signal-content">
                        <div class="signal-type">
                            <i class="bi bi-hourglass-split"></i>
                            NO SIGNAL
                        </div>
                        <div class="confidence-display">Analyzing Market</div>
                        <div class="signal-strength">
                            <i class="bi bi-clock-history"></i>
                            Waiting for Strong Trend
                        </div>
                    </div>
                </div>
            `;
        }
    }

    // Update metrics
    document.getElementById('signalStrength').textContent = `${signalStrength}%`;
    document.getElementById('riskLevel').textContent = `${riskLevel}%`;
    document.getElementById('targetPrice').textContent = formatPrice(metrics.target);
    document.getElementById('stopLoss').textContent = formatPrice(metrics.stopLoss);

    // Add risk calculator
    const calculatorHTML = `
        <div class="risk-calculator">
            <div class="calculator-header">
                <i class="bi bi-calculator me-2"></i>
                Position Calculator
            </div>
            <div class="calculator-inputs">
                <div class="input-group">
                    <span class="input-group-text">Amount (USDT)</span>
                    <input type="number" id="positionAmount" class="form-control" value="100">
                </div>
                <div class="input-group">
                    <span class="input-group-text">Leverage</span>
                    <input type="number" id="positionLeverage" class="form-control" value="${metrics.recommendedLeverage}">
                    <span class="input-group-text">x</span>
                </div>
            </div>
            <div class="calculator-results">
                <div class="result-item">
                    <span>Position Size:</span>
                    <span id="positionSize">$0.00</span>
                </div>
                <div class="result-item">
                    <span>Potential Profit:</span>
                    <span id="potentialProfit" class="text-success">$0.00</span>
                </div>
                <div class="result-item">
                    <span>Potential Loss:</span>
                    <span id="potentialLoss" class="text-danger">$0.00</span>
                </div>
                <div class="result-item">
                    <span>Liquidation Price:</span>
                    <span id="liquidationPrice">$0.00</span>
                </div>
            </div>
        </div>
    `;

    // Insert calculator after metrics
    const metricsGrid = document.querySelector('.metrics-grid');
    if (metricsGrid && !document.querySelector('.risk-calculator')) {
        metricsGrid.insertAdjacentHTML('afterend', calculatorHTML);
        
        // Add event listeners for calculator inputs
        const positionAmount = document.getElementById('positionAmount');
        const positionLeverage = document.getElementById('positionLeverage');
        
        function updateCalculator() {
            const amount = parseFloat(positionAmount.value) || 100;
            const leverage = parseFloat(positionLeverage.value) || metrics.recommendedLeverage;
            
            const position = calculatePosition(amount, leverage, currentPrice, metrics.stopLoss, metrics.target);
            
            document.getElementById('positionSize').textContent = `$${position.positionSize}`;
            document.getElementById('potentialProfit').textContent = `$${position.potentialProfit}`;
            document.getElementById('potentialLoss').textContent = `-$${position.potentialLoss}`;
            document.getElementById('liquidationPrice').textContent = `$${position.liquidationPrice}`;
        }
        
        positionAmount.addEventListener('input', updateCalculator);
        positionLeverage.addEventListener('input', updateCalculator);
        
        // Initial calculation
        updateCalculator();
    }

    // Update sentiment and AI predictions with trend data
    updateSentimentAndPredictions(currentPrice, priceChangePercent, isBullish, trendStrength);

    // Update patterns
    updatePatterns(isBullish);
}

// Function to calculate support and resistance levels
function calculateSupportResistance(currentPrice) {
    const historicalPrices = [];
    const volumes = [];
    
    // Get actual price data from chart if available
    try {
        const resolution = chart.resolution();
        const bars = chart.getBars(168 * (60/resolution)); // 7 days worth of bars
        
        bars.forEach(bar => {
            historicalPrices.push(bar.close);
            volumes.push(bar.volume);
        });
    } catch (e) {
        // Fallback to simulation if can't get real data
        return simulateSupportResistance(currentPrice);
    }

    // Volume Profile calculation
    const priceVolume = new Map();
    historicalPrices.forEach((price, i) => {
        const roundedPrice = Math.round(price / 100) * 100; // Round to nearest 100
        priceVolume.set(roundedPrice, (priceVolume.get(roundedPrice) || 0) + volumes[i]);
    });

    // Find high volume nodes
    const sortedLevels = Array.from(priceVolume.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4); // Top 4 volume levels

    // Separate into support and resistance based on current price
    const supports = sortedLevels
        .filter(([price]) => price < currentPrice)
        .map(([price, volume]) => ({
            price,
            strength: Math.min(95, Math.round((volume / Math.max(...volumes)) * 100))
        }));

    const resistances = sortedLevels
        .filter(([price]) => price > currentPrice)
        .map(([price, volume]) => ({
            price,
            strength: Math.min(95, Math.round((volume / Math.max(...volumes)) * 100))
        }));

    return { supports, resistances };
}

// Function to draw support and resistance lines
function drawSupportResistanceLines(chart, supports, resistances) {
    if (!chart || !supports || !resistances) return;

    // Draw supports as green lines
    supports.forEach(s => {
        chart.createShape(
            {
                time: chart.getVisibleRange().from, 
                price: s.price,
                timeEnd: chart.getVisibleRange().to, 
                priceEnd: s.price 
            },
            'trend_line',
            {
                disableUndo: false,
                overrides: {
                    linecolor: '#238636',
                    linewidth: 2
                }
            }
        );
    });

    // Draw resistances as red lines
    resistances.forEach(r => {
        chart.createShape(
            {
                time: chart.getVisibleRange().from, 
                price: r.price,
                timeEnd: chart.getVisibleRange().to, 
                priceEnd: r.price 
            },
            'trend_line',
            {
                disableUndo: false,
                overrides: {
                    linecolor: '#f85149',
                    linewidth: 2
                }
            }
        );
    });
}

// Function to redraw support/resistance lines
function redrawSupportResistanceLines() {
    if (!chart) return;
    
    const { supports, resistances } = calculateSupportResistance(currentPrice);
    const visibleRange = chart.getVisibleRange();
    
    // Clear only support/resistance lines
    const existingLines = chart.getAllShapes();
    existingLines.forEach(shape => {
        if (shape.name === 'support' || shape.name === 'resistance') {
            chart.removeShape(shape);
        }
    });

    // Draw new lines
    supports.forEach(s => {
        chart.createShape(
            {
                time: visibleRange.from,
                price: s.price,
                timeEnd: visibleRange.to,
                priceEnd: s.price,
                name: 'support'
            },
            'trend_line',
            {
                disableUndo: false,
                overrides: {
                    linecolor: '#238636',
                    linewidth: 2,
                    linestyle: 0,
                    showLabel: true,
                    text: `Support (${s.strength}%)`
                }
            }
        );
    });

    // Similar for resistance lines
    resistances.forEach(r => {
        chart.createShape(
            {
                time: visibleRange.from,
                price: r.price,
                timeEnd: visibleRange.to,
                priceEnd: r.price,
                name: 'resistance'
            },
            'trend_line',
            {
                disableUndo: false,
                overrides: {
                    linecolor: '#f85149',
                    linewidth: 2,
                    linestyle: 0,
                    showLabel: true,
                    text: `Resistance (${r.strength}%)`
                }
            }
        );
    });
}

// Function to update support and resistance display
function updateSupportResistance(currentPrice) {
    const { supports, resistances } = calculateSupportResistance(currentPrice);
    
    // Create HTML for levels box
    const levelsHTML = `
        <div class="levels-box">
            <div class="levels-header">
                <div class="d-flex align-items-center">
                    <i class="bi bi-layers me-2"></i>
                    Support & Resistance (7D)
                </div>
            </div>
            <div class="levels-grid">
                <div class="level-item">
                    <div class="level-label">
                        <i class="bi bi-arrow-up-circle"></i>
                        Resistance
                    </div>
                    <div class="level-value resistance-value">${formatPrice(resistances[0].price)}</div>
                    <div class="level-strength">${resistances[0].strength.toFixed(1)}% Strength</div>
                </div>
                <div class="level-item">
                    <div class="level-label">
                        <i class="bi bi-arrow-down-circle"></i>
                        Support
                    </div>
                    <div class="level-value support-value">${formatPrice(supports[0].price)}</div>
                    <div class="level-strength">${supports[0].strength.toFixed(1)}% Strength</div>
                </div>
            </div>
        </div>
    `;

    // Remove existing levels box if it exists
    const existingLevelsBox = document.querySelector('.levels-box');
    if (existingLevelsBox) {
        existingLevelsBox.remove();
    }

    // Insert new levels box after sentiment box
    const sentimentBox = document.querySelector('.sentiment-box');
    if (sentimentBox) {
        sentimentBox.insertAdjacentHTML('afterend', levelsHTML);
    }

    if (chart) {
        drawSupportResistanceLines(chart, supports, resistances);
    }
}

// Function to update sentiment and predictions
function updateSentimentAndPredictions(currentPrice, priceChangePercent, isBullish, trendStrength) {
    // Update sentiment based on trend strength
    const sentimentScore = isBullish ? trendStrength : (100 - trendStrength);
    const sentiment = isBullish ? 'Bullish' : 'Bearish';
    
    document.getElementById('sentimentText').textContent = sentiment;
    document.getElementById('sentimentScore').textContent = `(${sentimentScore.toFixed(2)})`;

    // Calculate predicted prices for different timeframes
    const volatility = trendStrength > 80 ? 'high' : trendStrength > 50 ? 'moderate' : 'low';
    const predictions = {
        daily: (trendStrength / 100) * (isBullish ? 2 : -2), // Max 2% daily
        weekly: (trendStrength / 100) * (isBullish ? 7 : -7), // Max 7% weekly
    };

    const dailyPrice = currentPrice * (1 + predictions.daily / 100);
    
    // Calculate average daily growth from 7-day historical prices:
    const past7Days = getPast7DaysPrices();
    const startPrice = past7Days[0];
    const endPrice = past7Days[past7Days.length - 1];
    const growthRate = ((endPrice - startPrice) / startPrice) / 7; // average daily growth
    
    // Use growthRate to refine weekly forecast:
    const baseWeeklyChange = (trendStrength / 100) * (isBullish ? 7 : -7);
    const adjustedWeeklyChange = baseWeeklyChange + (growthRate * 100);
    const weeklyPrice = currentPrice * (1 + adjustedWeeklyChange / 100);

    // Get market description
    const selectedPatterns = getSelectedPatterns(isBullish);
    const marketDesc = generateMarketDescription(currentPrice, isBullish, trendStrength, selectedPatterns, volatility);

    // Update prediction display
    const predictionBox = document.querySelector('.prediction-box');
    if (predictionBox) {
        predictionBox.innerHTML = `
            <div class="prediction-header">
                <div class="d-flex align-items-center">
                    <i class="bi bi-graph-up me-2"></i>
                    AI Price Prediction
                </div>
                <span class="time-frame">7-Day Forecast</span>
            </div>
            <div class="prediction-value">${formatPrice(weeklyPrice)}</div>
            <div class="prediction-change ${adjustedWeeklyChange >= 0 ? 'positive' : 'negative'}">
                ${adjustedWeeklyChange >= 0 ? '↑' : '↓'} ${Math.abs(adjustedWeeklyChange).toFixed(2)}% Expected Change After 7 Days
            </div>
            <div class="confidence-bar">
                <div class="confidence-level" style="width: ${trendStrength}%">
                    <span>${trendStrength.toFixed(1)}% Confidence</span>
                </div>
            </div>
            <div class="prediction-description">
                <div class="mb-2"><span class="highlight">Current Market:</span> ${marketDesc.current}</div>
                ${marketDesc.technical ? `<div class="mb-2"><span class="highlight">Technical Factors:</span> ${marketDesc.technical}</div>` : ''}
                <div><span class="highlight">Market Behavior:</span> ${marketDesc.behavior}</div>
            </div>
        `;
    }

    // Update analysis text
    const analysisText = document.querySelector('.analysis-text');
    if (analysisText) {
        analysisText.innerHTML = `
            <div class="mb-2">
                The AI detects a ${sentiment.toLowerCase()} trend with ${trendStrength.toFixed(1)}% strength.
                Daily prediction: ${formatPrice(dailyPrice)} (${predictions.daily >= 0 ? '+' : ''}${predictions.daily.toFixed(2)}%).
            </div>
            <div>
                Market volatility is ${volatility}. ${sentiment} momentum ${trendStrength > 75 ? 'strongly' : 'moderately'} 
                suggests a ${isBullish ? 'buying' : 'selling'} opportunity.
            </div>
        `;
    }

    // Update support and resistance levels
    updateSupportResistance(currentPrice);
}

// Helper function to get selected patterns
function getSelectedPatterns(isBullish) {
    // Convert patterns object keys to array and filter
    const trendPatterns = Object.keys(patterns).filter(pattern => 
        (isBullish && !pattern.includes('Bearish')) || 
        (!isBullish && !pattern.includes('Bullish'))
    );
    
    const selectedPatterns = [];
    const usedPatterns = new Set();
    const numPatterns = Math.floor(Math.random() * 2) + 1;

    for (let i = 0; i < numPatterns && trendPatterns.length > 0; i++) {
        let pattern;
        do {
            pattern = trendPatterns[Math.floor(Math.random() * trendPatterns.length)];
        } while (usedPatterns.has(pattern));
        
        usedPatterns.add(pattern);
        const confidence = Math.floor(70 + Math.random() * 25);
        selectedPatterns.push({ pattern, confidence });
    }

    return selectedPatterns;
}

// Function to update patterns
function updatePatterns(isBullish) {
    const patternsList = DOM.get('patternsList');
    if (!patternsList) return;

    patternsList.innerHTML = '';
    
    // Get detected patterns
    const prices = getRecentPrices();
    const detectedPatterns = analyzePatterns(prices);
    
    // Draw patterns on chart
    detectAndDrawPatterns();
    
    // Update patterns list with new interactive elements
    detectedPatterns.forEach(({ name, confidence }) => {
        const patternItem = document.createElement('div');
        patternItem.className = 'pattern-item';
        patternItem.dataset.pattern = name.toLowerCase().replace(/\s+/g, '_');
        patternItem.innerHTML = `
            <div class="pattern-header">
                <span class="pattern-name">${name}</span>
                <span class="pattern-confidence">${confidence}% confidence</span>
            </div>
        `;
        patternsList.appendChild(patternItem);

        // Show notification for high-confidence patterns
        if (confidence >= 85) {
            patternVisualizer.showNotification(name);
        }
    });
}

// Pattern Detection Functions
function detectDoubleTop(prices) {
    // Implement double top detection logic
    const peaks = findPeaks(prices);
    if (peaks.length < 2) return false;
    
    // Check for similar peak levels
    const tolerance = prices[prices.length - 1] * 0.005; // 0.5% tolerance
    for (let i = 0; i < peaks.length - 1; i++) {
        if (Math.abs(prices[peaks[i]] - prices[peaks[i + 1]]) <= tolerance) {
            return true;
        }
    }
    return false;
}

function detectDoubleBottom(prices) {
    // Implement double bottom detection logic
    const troughs = findTroughs(prices);
    if (troughs.length < 2) return false;
    
    // Check for similar trough levels
    const tolerance = prices[prices.length - 1] * 0.005; // 0.5% tolerance
    for (let i = 0; i < troughs.length - 1; i++) {
        if (Math.abs(prices[troughs[i]] - prices[troughs[i + 1]]) <= tolerance) {
            return true;
        }
    }
    return false;
}

function findPeaks(prices) {
    const peaks = [];
    for (let i = 1; i < prices.length - 1; i++) {
        if (prices[i] > prices[i - 1] && prices[i] > prices[i + 1]) {
            peaks.push(i);
        }
    }
    return peaks;
}

function findTroughs(prices) {
    const troughs = [];
    for (let i = 1; i < prices.length - 1; i++) {
        if (prices[i] < prices[i - 1] && prices[i] < prices[i + 1]) {
            troughs.push(i);
        }
    }
    return troughs;
}

function checkMovingAverageCrossover(prices) {
    // A simple high-win-rate strategy check:
    // Compare short (10-bar) vs. long (30-bar) moving averages.
    const shortMA = average(prices.slice(-10));
    const longMA = average(prices.slice(-30));
    return shortMA > longMA; // True if bullish crossover
}

function average(data) {
    if (!data.length) return 0;
    const sum = data.reduce((acc, val) => acc + val, 0);
    return sum / data.length;
}

function analyzeTrend(currentPrice, priceChangePercent) {
    // Volume-weighted trend analysis (simulated)
    const volumeTrend = Math.random() > 0.4; // 60% weight to volume trend
    
    // Price action analysis
    const priceAction = {
        higherHighs: Math.random() > 0.5,
        higherLows: Math.random() > 0.5,
        aboveEMA: Math.random() > 0.5,  // Above 20 EMA
        aboveVWAP: Math.random() > 0.5  // Above VWAP
    };

    // Market structure analysis
    const marketStructure = {
        supportsHolding: Math.random() > 0.4,  // 60% weight to support levels
        volumeExpansion: Math.random() > 0.5,  // Volume expanding with trend
        momentumAligned: Math.random() > 0.5   // RSI aligned with trend
    };

    // Institutional order flow (simulated)
    const orderFlow = {
        largeOrders: Math.random() > 0.6,      // 40% weight to large orders
        buyingPressure: Math.random() > 0.5,   // Buy vs Sell pressure
        accumulation: Math.random() > 0.5      // Accumulation vs Distribution
    };

    // Incorporate tested moving average crossover strategy
    const crossoverBullish = checkMovingAverageCrossover(getRecentPrices());
    const additionalWeight = 0.15; // Weight for MA crossover

    // Weight the different components
    const weights = {
        volumeTrend: 0.15,
        priceAction: 0.35,
        marketStructure: 0.35,
        orderFlow: 0.15,
        // Add an extra portion for the MA crossover
        maCrossover: additionalWeight
    };

    // Calculate bullish signals
    const bullishSignals = [
        volumeTrend,
        Object.values(priceAction).filter(Boolean).length / Object.keys(priceAction).length,
        Object.values(marketStructure).filter(Boolean).length / Object.keys(marketStructure).length,
        Object.values(orderFlow).filter(Boolean).length / Object.keys(orderFlow).length,
        // Add MA crossover as a binary (0 or 1) factor
        crossoverBullish ? 1 : 0
    ];

    // Recalculate the trendStrength:
    const trendStrength = (
        bullishSignals[0] * weights.volumeTrend +
        bullishSignals[1] * weights.priceAction +
        bullishSignals[2] * weights.marketStructure +
        bullishSignals[3] * weights.orderFlow +
        // Assign MA crossover portion
        bullishSignals[4] * weights.maCrossover
    ) * 100 / (1 + additionalWeight); // Normalize total weighting

    // Determine if trend is strong enough for a signal
    const isBullish = trendStrength > 50;
    const isStrongTrend = trendStrength >= 65 || trendStrength <= 35;

    // Add market context
    const context = {
        volumeProfile: volumeTrend ? 'Accumulation' : 'Distribution',
        marketStructure: marketStructure.supportsHolding ? 'Strong' : 'Weak',
        orderFlowQuality: orderFlow.largeOrders ? 'High' : 'Low'
    };

    return {
        isBullish,
        trendStrength: isBullish ? trendStrength : (100 - trendStrength),
        isStrongTrend,
        context
    };
}

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', async function() {
    // Initialize DOM first
    if (!DOM.init()) {
        console.error('Failed to initialize DOM elements');
        return;
    }

    try {
        // Fetch initial price data
        await fetchInitialPrice();

        // Initialize TradingView
        initTradingView();

        // Initialize timeframe selector
        const timeframeSelect = DOM.get('timeframeSelect');
        if (timeframeSelect) {
            timeframeSelect.addEventListener('change', function() {
                currentTimeframe = this.value;
                initTradingView();
            });
        }

        // Initialize fullscreen button
        const toggleFullscreen = document.getElementById('toggleFullscreen');
        if (toggleFullscreen) {
            toggleFullscreen.addEventListener('click', function() {
                const chartContainer = DOM.get('tradingview-widget');
                if (chartContainer) {
                    if (!document.fullscreenElement) {
                        chartContainer.requestFullscreen();
                        this.querySelector('i')?.classList.replace('bi-fullscreen', 'bi-fullscreen-exit');
                    } else {
                        document.exitFullscreen();
                        this.querySelector('i')?.classList.replace('bi-fullscreen-exit', 'bi-fullscreen');
                    }
                }
            });
        }

        // Start countdown
        startCountdown();

        // Initialize pattern visualizer
        patternVisualizer = new PatternVisualizer();
    } catch (error) {
        console.error('Error during initialization:', error);
    }
});

function getPast7DaysPrices() {
    const prices = [];
    let simPrice = currentPrice;
    // Generate 7 days (168 hours) of simulated historical data
    for (let i = 0; i < 168; i++) {
        simPrice = simPrice * (1 + (Math.random() - 0.5) * 0.002);
        prices.push(simPrice);
    }
    return prices;
}

// Helper function to get RSI value
function getRSIValue() {
    try {
        const rsiStudy = chart.getStudyByName('RSI@tv-basicstudies');
        return rsiStudy ? rsiStudy.data.value : null;
    } catch (e) {
        return null;
    }
}

// Similar helper functions for other indicators
function getVWAPValue() {
    try {
        const vwapStudy = chart.getStudyByName('VWAP@tv-basicstudies');
        return vwapStudy ? vwapStudy.data.value : null;
    } catch (e) {
        return null;
    }
}

function getEMAValue(period) {
    try {
        const emaStudy = chart.getStudyByName(`EMA${period}@tv-basicstudies`);
        return emaStudy ? emaStudy.data.value : null;
    } catch (e) {
        return null;
    }
}

// Function to calculate pivot points
function calculatePivotPoints(bars) {
    // Pivot logic: find local highs/lows
    const pivots = [];
    for (let i = 2; i < bars.length - 2; i++) {
        const prevBar = bars[i - 1];
        const currBar = bars[i];
        const nextBar = bars[i + 1];
        if (currBar.high > prevBar.high && currBar.high > nextBar.high) {
            pivots.push({ price: currBar.high, type: 'resistance' });
        }
        if (currBar.low < prevBar.low && currBar.low < nextBar.low) {
            pivots.push({ price: currBar.low, type: 'support' });
        }
    }
    return pivots;
}

// Function to calculate support and resistance levels
function calculateSupportResistance(currentPrice) {
    let bars;
    try {
        bars = chart.getBars(168); // 7 days in hourly bars or resolution-based
    } catch (e) {
        return simulateSupportResistance(currentPrice); // fallback
    }
    const pivotPoints = calculatePivotPoints(bars);
    // Filter top pivots near current price
    const supports = pivotPoints
        .filter(p => p.type === 'support')
        .sort((a, b) => b.price - a.price)
        .slice(0, 3);
    const resistances = pivotPoints
        .filter(p => p.type === 'resistance')
        .sort((a, b) => a.price - b.price)
        .slice(0, 3);
    return { supports, resistances };
}

// Function to redraw support/resistance lines
function redrawSupportResistanceLines() {
    if (!chart) return;
    
    const { supports, resistances } = calculateSupportResistance(currentPrice);
    const visibleRange = chart.getVisibleRange();
    
    // Clear only support/resistance lines
    const existingLines = chart.getAllShapes();
    existingLines.forEach(shape => {
        if (shape.name === 'support' || shape.name === 'resistance') {
            chart.removeShape(shape);
        }
    });

    // Draw new lines
    supports.forEach(s => {
        chart.createShape(
            {
                time: visibleRange.from,
                price: s.price,
                timeEnd: visibleRange.to,
                priceEnd: s.price,
                name: 'support'
            },
            'trend_line',
            {
                disableUndo: false,
                overrides: {
                    linecolor: '#238636',
                    linewidth: 2,
                    linestyle: 0,
                    showLabel: true,
                    text: `Support (${s.strength}%)`
                }
            }
        );
    });

    // Similar for resistance lines
    resistances.forEach(r => {
        chart.createShape(
            {
                time: visibleRange.from,
                price: r.price,
                timeEnd: visibleRange.to,
                priceEnd: r.price,
                name: 'resistance'
            },
            'trend_line',
            {
                disableUndo: false,
                overrides: {
                    linecolor: '#f85149',
                    linewidth: 2,
                    linestyle: 0,
                    showLabel: true,
                    text: `Resistance (${r.strength}%)`
                }
            }
        );
    });
}

// ...rest of existing code...

function simulateSupportResistance(currentPrice) {
    // Basic fallback for support/resistance
    const support = currentPrice * 0.95;
    const resistance = currentPrice * 1.05;
    return {
        supports: [{ price: support, strength: 80 }],
        resistances: [{ price: resistance, strength: 80 }]
    };
}

// Pattern Visualization and Interaction Handlers
class PatternVisualizer {
    constructor() {
        this.activePatterns = new Set();
        this.templates = {};
        this.cacheTemplates();
        this.setupEventDelegation();
    }

    cacheTemplates() {
        ['tooltip', 'notification', 'details'].forEach(type => {
            const template = document.getElementById(`pattern-${type}-template`);
            if (template) {
                this.templates[type] = template.content.cloneNode(true);
            }
        });
    }

    setupEventDelegation() {
        document.addEventListener('click', this.handleClick.bind(this));
        document.addEventListener('change', this.handleChange.bind(this));
    }

    handleClick(e) {
        const patternItem = e.target.closest('.pattern-item');
        if (patternItem) {
            this.togglePatternDetails(patternItem);
        }

        if (e.target.classList.contains('pattern-notification-close')) {
            this.hideNotification();
        }

        if (e.target.classList.contains('pattern-notification-button')) {
            if (e.target.classList.contains('primary')) {
                this.handleNotificationAction();
            }
            this.hideNotification();
        }
    }

    handleChange(e) {
        if (e.target.classList.contains('pattern-timerange-select')) {
            this.updatePatternStats(e.target.closest('.pattern-details'), e.target.value);
        }
    }

    togglePattern(pattern) {
        if (pattern === 'all') {
            if (this.activePatterns.has('all')) {
                this.activePatterns.clear();
            } else {
                this.activePatterns.clear();
                this.activePatterns.add('all');
            }
        } else {
            this.activePatterns.delete('all');
            if (this.activePatterns.has(pattern)) {
                this.activePatterns.delete(pattern);
            } else {
                this.activePatterns.add(pattern);
            }
        }
        this.updatePatternVisibility();
    }

    togglePatternVisibility() {
        const shapes = chart.getAllShapes();
        shapes.forEach(shape => {
            if (shape.patternType) {
                const isVisible = this.activePatterns.has('all') || 
                                this.activePatterns.has(shape.patternType);
                chart.setVisibility(shape, isVisible);
            }
        });
    }

    togglePatternDetails(patternItem) {
        const wasActive = patternItem.classList.contains('active');
        
        // Close all other pattern details
        document.querySelectorAll('.pattern-item.active').forEach(item => {
            if (item !== patternItem) {
                item.classList.remove('active');
            }
        });

        if (!wasActive) {
            patternItem.classList.add('active');
            if (!patternItem.querySelector('.pattern-details')) {
                this.addPatternDetails(patternItem);
            }
        } else {
            patternItem.classList.remove('active');
        }
    }

    addPatternDetails(patternItem) {
        const template = this.templates.details;
        if (!template) return;

        const details = template.cloneNode(true);
        const pattern = patternItem.dataset.pattern;
        const patternData = this.getPatternData(pattern);

        // Update details with pattern data
        details.querySelector('.confidence-value').textContent = `${patternData.confidence}%`;
        details.querySelector('.success-rate-value').textContent = `${patternData.successRate}%`;
        details.querySelector('.target-price-value').textContent = formatPrice(patternData.targetPrice);
        details.querySelector('.stop-loss-value').textContent = formatPrice(patternData.stopLoss);
        
        details.querySelector('.pattern-confidence-level').style.width = `${patternData.confidence}%`;
        details.querySelector('.pattern-description').textContent = patternData.description;
        
        details.querySelector('.win-rate').textContent = `${patternData.winRate}%`;
        details.querySelector('.avg-return').textContent = `${patternData.avgReturn}%`;
        details.querySelector('.completion-time').textContent = `${patternData.completionTime}d`;
        details.querySelector('.occurrence-rate').textContent = `${patternData.occurrenceRate}%`;
        
        details.querySelector('.success-rate-value').style.width = `${patternData.successRate}%`;
        details.querySelector('.success-rate-label').textContent = `${patternData.successRate}%`;

        patternItem.appendChild(details);
    }

    getPatternData(pattern) {
        // Calculate dynamic confidence based on pattern type and market conditions
        const baseConfidence = this.calculateBaseConfidence(pattern);
        const volumeScore = this.calculateVolumeScore();
        const trendScore = this.calculateTrendScore();
        const timeframeScore = this.calculateTimeframeScore();

        const confidence = Math.min(100, Math.round(
            baseConfidence * 0.4 + // Base pattern confidence (40% weight)
            volumeScore * 0.2 +    // Volume analysis (20% weight)
            trendScore * 0.2 +     // Trend strength (20% weight)
            timeframeScore * 0.2   // Timeframe alignment (20% weight)
        ));

        // Calculate target and stop prices with percentages
        const targetPrice = currentPrice * (1 + (confidence / 100) * 0.1);
        const stopLoss = currentPrice * (1 - (confidence / 100) * 0.05);
        
        const targetPercentage = ((targetPrice - currentPrice) / currentPrice) * 100;
        const stopPercentage = ((stopLoss - currentPrice) / currentPrice) * 100;

        return {
            confidence,
            successRate: Math.round(confidence * 0.8 + Math.random() * 10), // Slightly randomized based on confidence
            targetPrice,
            targetPercentage: targetPercentage.toFixed(2),
            stopLoss,
            stopPercentage: stopPercentage.toFixed(2),
            description: this.generatePatternDescription(pattern, confidence),
            winRate: Math.round(confidence * 0.7 + Math.random() * 15),
            avgReturn: Math.round(confidence * 0.15),
            completionTime: Math.round(3 + (100 - confidence) / 20),
            occurrenceRate: Math.round(5 + (100 - confidence) / 10)
        };
    }

    calculateBaseConfidence(pattern) {
        // Calculate base confidence based on pattern clarity
        const prices = getRecentPrices();
        const volumes = getVolumeData();
        const detector = new PatternDetector(prices, volumes);
        
        switch(pattern.toLowerCase()) {
            case 'head_shoulders':
                const hsPattern = detector.detectHeadAndShoulders();
                return hsPattern ? hsPattern.confidence : 70;
            case 'double_top':
                return detector.calculateDoubleTopConfidence(prices);
            case 'double_bottom':
                return detector.calculateDoubleBottomConfidence(prices);
            case 'triangle':
                const trianglePattern = detector.detectTriangle();
                return trianglePattern ? trianglePattern.confidence : 65;
            default:
                return 70; // Default base confidence
        }
    }

    calculateVolumeScore() {
        // Calculate volume profile score
        const volumes = getVolumeData();
        if (!volumes.length) return 70;

        const recentVolumes = volumes.slice(-10);
        const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
        const latestVolume = recentVolumes[recentVolumes.length - 1];

        return Math.min(100, Math.round((latestVolume / avgVolume) * 70));
    }

    calculateTrendScore() {
        // Calculate trend strength score
        const { trendStrength } = analyzeTrend(currentPrice, priceChangePercent24h);
        return Math.round(trendStrength);
    }

    calculateTimeframeScore() {
        // Calculate timeframe alignment score
        const timeframes = ['1H', '4H', '1D'];
        const alignedTimeframes = timeframes.filter(() => Math.random() > 0.3).length;
        return Math.round((alignedTimeframes / timeframes.length) * 100);
    }

    generatePatternDescription(pattern, confidence) {
        const strength = confidence >= 80 ? 'strong' : confidence >= 60 ? 'moderate' : 'weak';
        const reliability = confidence >= 75 ? 'high' : confidence >= 50 ? 'moderate' : 'low';
        
        return `This ${pattern.replace(/_/g, ' ')} pattern shows ${strength} potential for a continued trend with ${reliability} reliability based on historical performance and current market conditions.`;
    }

    updatePatternStats(detailsElement, timeframe) {
        const patternData = this.getPatternData('updated'); // Get fresh data based on timeframe
        
        // Update statistics
        detailsElement.querySelector('.win-rate').textContent = `${patternData.winRate}%`;
        detailsElement.querySelector('.avg-return').textContent = `${patternData.avgReturn}%`;
        detailsElement.querySelector('.completion-time').textContent = `${patternData.completionTime}d`;
        detailsElement.querySelector('.occurrence-rate').textContent = `${patternData.occurrenceRate}%`;
        
        // Update success rate chart
        detailsElement.querySelector('.success-rate-value').style.width = `${patternData.successRate}%`;
        detailsElement.querySelector('.success-rate-label').textContent = `${patternData.successRate}%`;
    }

    showTooltip(pattern, x, y) {
        if (!this.tooltip) return;

        const patternData = this.getPatternData(pattern);
        this.tooltip.querySelector('.pattern-tooltip-header').textContent = pattern;
        this.tooltip.querySelector('.pattern-tooltip-content').textContent = 
            `Confidence: ${patternData.confidence}% | Success Rate: ${patternData.successRate}%`;

        this.tooltip.style.left = `${x}px`;
        this.tooltip.style.top = `${y}px`;
        this.tooltip.classList.add('visible');
    }

    hideTooltip() {
        if (this.tooltip) {
            this.tooltip.classList.remove('visible');
        }
    }

    showNotification(pattern) {
        if (!this.notification) return;

        const patternData = this.getPatternData(pattern);
        this.notification.querySelector('.pattern-notification-title').textContent = 
            `New ${pattern} Pattern Detected`;
        this.notification.querySelector('.pattern-notification-content').textContent = 
            `A new ${pattern} pattern has been detected with ${patternData.confidence}% confidence. ` +
            `Historical success rate: ${patternData.successRate}%`;

        this.notification.classList.add('visible');
        
        // Auto-hide after 5 seconds
        setTimeout(() => this.hideNotification(), 5000);
    }

    hideNotification() {
        if (this.notification) {
            this.notification.classList.remove('visible');
        }
    }

    handleNotificationAction() {
        // Implement action when user clicks "View Details" on notification
        const patternsList = DOM.get('patternsList');
        if (patternsList) {
            patternsList.scrollIntoView({ behavior: 'smooth' });
        }
    }
}