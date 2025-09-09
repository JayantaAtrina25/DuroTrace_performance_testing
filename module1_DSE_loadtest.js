// k6-module1.js
// This script performs a load test on the Serial Codes and Master Data APIs.

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
  group('Module 1: Serial Codes & Master Data Tests', () => {

    // Group 1: Testing the 'Get Serial Code Details' endpoint
    group('GET - Get Serial Code Details', () => {
      const res = http.get(`${BASE_URL}/api/serialcode/get-serial-code-details-data`, {
        headers: { 'Content-Type': 'application/json' },
      });
      check(res, {
        'GET details status is 200': (r) => r.status === 200,
        'GET details has non-empty body': (r) => r.body.length > 0,
      });
    });

    // Group 2: Testing the 'Generate Serial Codes' endpoint
    group('POST - Generate Serial Codes', () => {
      const payload = JSON.stringify({
        product_category_code: 1,
        plant_code: "P001",
        procurement_type_code: 1,
        no_of_code: 2,
        user_code: "3fa85f64-5717-4562-b3fc-2c963f66afa6"
      });
      const res = http.post(`${BASE_URL}/api/serialcode/generate`, payload, {
        headers: { 'Content-Type': 'application/json' },
      });
      check(res, {
        'POST generate status is 201': (r) => r.status === 201,
        'POST generate has non-empty body': (r) => r.body.length > 0,
      });
    });

    // Group 3: Testing the 'Get Serial Code Headers' endpoint
    group('GET - Get Serial Code Headers', () => {
      const res = http.get(`${BASE_URL}/api/serialcode/get-serial-code-headers-data`, {
        headers: { 'Content-Type': 'application/json' },
      });
      check(res, {
        'GET headers status is 200': (r) => r.status === 200,
        'GET headers has non-empty body': (r) => r.body.length > 0,
      });
    });

    // Group 4: Testing the master data endpoints
    group('Master Data Endpoints', () => {
      const plantsRes = http.get(`${BASE_URL}/api/master/get-plants-data`, {
        headers: { 'Content-Type': 'application/json' },
      });
      check(plantsRes, {
        'GET plants data status is 200': (r) => r.status === 200,
        'GET plants data has non-empty body': (r) => r.body.length > 0,
      });

      const categoriesRes = http.get(`${BASE_URL}/api/master/get-product-categories-data`, {
        headers: { 'Content-Type': 'application/json' },
      });
      check(categoriesRes, {
        'GET product categories status is 200': (r) => r.status === 200,
        'GET product categories has non-empty body': (r) => r.body.length > 0,
      });

      const procurementRes = http.get(`${BASE_URL}/api/master/get-procurement-types-data`, {
        headers: { 'Content-Type': 'application/json' },
      });
      check(procurementRes, {
        'GET procurement types status is 200': (r) => r.status === 200,
        'GET procurement types has non-empty body': (r) => r.body.length > 0,
      });
    });
  });

  sleep(1);
}
