const express = require('express');
const app = express();
const PORT = process.env.PORT || 3099;

app.use(express.json());

class APIQueue {
    constructor() {
        this.queue = [];
        this.processing = false;
        this.lastCallTime = 0;
        this.MIN_INTERVAL = 5000; // 5 seconds in milliseconds
    }

    async addToQueue(apiCall) {
        return new Promise((resolve, reject) => {
            this.queue.push({
                apiCall,
                resolve,
                reject
            });
            this.processQueue();
        });
    }

    async processQueue() {
        if (this.processing || this.queue.length === 0) {
            return;
        }

        this.processing = true;

        const now = Date.now();
        const timeSinceLastCall = now - this.lastCallTime;
        
        if (timeSinceLastCall < this.MIN_INTERVAL) {
            // Wait for the remaining time
            const waitTime = this.MIN_INTERVAL - timeSinceLastCall;
            setTimeout(() => {
                this.executeNext();
            }, waitTime);
        } else {
            this.executeNext();
        }
    }

    async executeNext() {
        if (this.queue.length === 0) {
            this.processing = false;
            return;
        }

        const item = this.queue.shift();
        this.lastCallTime = Date.now();

        try {
            // Simulate your main API call
            const result = await this.callMainAPI(item.apiCall);
            item.resolve(result);
        } catch (error) {
            item.reject(error);
        }

        // Process next item after minimum interval
        setTimeout(() => {
            this.processing = false;
            this.processQueue();
        }, this.MIN_INTERVAL);
    }

    async callMainAPI(req) {
        // Replace this with your actual main API call
        console.log(`📞 Calling main API with:`, req);
        try {
            const response = await fetch(`https://smsgen.net/api/get-number/${req.data.api_key}?country_id=${req.data.country_id}&operator_id=${req.data.operator_id}`);
            const result = await response.json();
            console.log(`📞 Main API response:`, result);
            return {
                status: result.status === 'success',
                phone_number: result.data.phone_number || ""
            }
        } catch (error) {
            return {
                status: false,
                phone_number: ""
            }
        }
    }

    getQueueStatus() {
        return {
            queueLength: this.queue.length,
            processing: this.processing,
            lastCallTime: this.lastCallTime,
            waitingTime: this.queue.length * this.MIN_INTERVAL
        };
    }
}

// Initialize the queue
const apiQueue = new APIQueue();

// Routes
app.post('/api/call', async (req, res) => {
    try {
        const { api_key, country_id, operator_id } = req.body;

        if (!api_key || !country_id || !operator_id) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields'
            });
        }
        
        console.log(`📥 Received API call:`, req.body);
        
        const result = await apiQueue.addToQueue({
            data: req.body,
            timestamp: Date.now()
        });

        res.json({
            success: result.status,
            phone_number: result.phone_number,
            queueStatus: apiQueue.getQueueStatus()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/queue/status', (req, res) => {
    res.json(apiQueue.getQueueStatus());
});

app.get('/queue/clear', (req, res) => {
    apiQueue.queue = [];
    res.json({ message: 'Queue cleared' });
});

app.listen(PORT, () => {
    console.log(`🚀 Queue Management Server running on port ${PORT}`);
    console.log(`⏰ API calls limited to 1 every 5 seconds`);
});