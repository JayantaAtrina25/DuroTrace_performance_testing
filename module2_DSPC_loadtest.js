// k6-module2.js
// This script performs a load test on the SmartPrint APIs.

import http from 'k6/http';
import { check, group, sleep } from 'k6';

// The base URL for the Durotrace API
const BASE_URL = 'https://dev-durotrace-api.azurewebsites.net';

/**
 * Test configuration and thresholds.
 * This configuration includes a ramp-up, steady-state, and ramp-down phase.
 */
export const options = {
  stages: [
    // 1. Ramp-up: Slowly increase the load from 0 to 50 virtual users over 1 minute.
    { duration: '1m', target: 10},
    // 2. Steady-State: Hold the load at 50 virtual users for 5 minutes.
    { duration: '5m', target: 10 },
    // 3. Ramp-down: Slowly decrease the load back to 0 virtual users over 10 seconds.
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<2000'],
  },
};

/**
 * The main entry point for the k6 test.
 * The script will be executed repeatedly by the virtual users.
 */
export default function () {
  group('Module 2: SmartPrint Tests', () => {
    
    // Group 1: Testing the SmartPrint POST endpoint
    group('POST - SmartPrint', () => {
      const payload = JSON.stringify({
        "vendor_type": "Vendor",
        "vendor_code": "3fa85f64-5717-4562-b3fc-2c963f66afa4",
        "file_format": "PDF",
        "delivery_method": "FileDownload",
        "no_of_code": 3,
        "plant_code": "P001",
        "plant_name": "PDN Factory",
        "user_code": "3fa85f64-5717-4562-b3fc-2c963f66afa6"
      });
      const res = http.post(`${BASE_URL}/api/SmartPrint`, payload, {
        headers: { 'Content-Type': 'application/json' },
      });
      check(res, {
        'POST SmartPrint status is 201': (r) => r.status === 201,
        'POST SmartPrint has non-empty body': (r) => r.body.length > 0,
      });
    });
    
    // Group 2: Testing the SmartPrint GET Endpoints
    group('SmartPrint GET Endpoints', () => {
      const headersRes = http.get(`${BASE_URL}/api/smartprint/get-smart-print-headers-data`, {
        headers: { 'Content-Type': 'application/json' },
      });
      check(headersRes, {
        'GET smart print headers status is 200': (r) => r.status === 200,
        'GET smart print headers has non-empty body': (r) => r.body.length > 0,
      });

      const detailsRes = http.get(`${BASE_URL}/api/smartprint/get-smart-print-details-data`, {
        headers: { 'Content-Type': 'application/json' },
      });
      check(detailsRes, {
        'GET smart print details status is 200': (r) => r.status === 200,
        'GET smart print details has non-empty body': (r) => r.body.length > 0,
      });
    });
  });

  sleep(1);
}
