const express = require('express');
const fetch = require('node-fetch');
const app = express();
const PORT = process.env.PORT || 3099;
const delay = process.argv[2] ? parseInt(process.argv[2], 10) : 10000;

// Enable CORS for all routes
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', true);
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
});
app.use(express.json());

class APIQueue {
    constructor() {
        this.queue = [];
        this.processing = false;
        this.lastCallTime = 0;
        this.MIN_INTERVAL = delay;
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
        const url = `https://smsgen.net/api/get-number/${req.data.api_key}?country_id=${req.data.country_id}&operator_id=${req.data.operator_id}`;
        
        try {
            console.log(`🌐 Making request to: ${url}`);
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                timeout: 10000 // 10 seconds timeout
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            console.log(`✅ Main API response:`, result);
            
            return {
                status: result.status === 'success',
                phone_number: result.data?.phone_number || "",
                rawResponse: result
            };
        } catch (error) {
            console.error('❌ API call failed:', {
                error: error.message,
                url,
                data: req.data,
                stack: error.stack
            });
            
            // Retry logic could be added here if needed
            return {
                status: false,
                phone_number: "",
                error: error.message || 'Unknown error occurred',
                retryable: isRetryableError(error)
            };
        }
        
        function isRetryableError(error) {
            // List of error codes that might be worth retrying
            const retryableErrors = [
                'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED',
                'ENOTFOUND', 'EAI_AGAIN'
            ];
            return retryableErrors.some(code => 
                error.code === code || 
                (error.cause && error.cause.code === code)
            );
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
    console.log(`⏰ API calls limited to 1 every ${delay / 1000} seconds`);
});