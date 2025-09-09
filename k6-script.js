// This script is configured to output results to a JSON file.
// It performs a load test on the Durotrace API by simulating multiple users.
//
// To run this script and test with different VUs:
// 1. Install k6: https://k6.io/docs/getting-started/installation/
// 2. Run from your terminal, specifying the number of VUs and duration.
//
//    To test with 50 VUs and a duration of 5 minutes:
//    k6 run --vus 50 --duration 5m k6-script.js
//
//    To test with 150 VUs and a duration of 5 minutes:
//    k6 run --vus 150 --duration 5m k6-script.js
//
// To test with different database sizes (10k, 50k, 100k records),
// you must manually update your database before each test run. You can
// use the `--tags` flag to track which test run corresponds to which data size.
// For example:
// k6 run --vus 50 --duration 5m --tags dataSize=10000 k6-script.js
// k6 run --vus 50 --duration 5m --tags dataSize=50000 k6-script.js

import http from 'k6/http';
import { check, group } from 'k6';
import { Trend } from 'k6/metrics';

// The base URL for the Durotrace API
const BASE_URL = 'https://dev-durotrace-api.azurewebsites.net';

// Custom Trend metrics for each endpoint to set specific thresholds
const getPaginatedDataTrend = new Trend('get_paginated_data_duration');
const getHeadersTrend = new Trend('get_serial_code_headers_duration');
const postGenerateTrend = new Trend('post_generate_duration');

/**
 * Test configuration and thresholds.
 * The VUs and duration are now controlled via the command line flags for flexibility.
 */
export const options = {
  // Use `--vus` and `--duration` flags for simple, steady-state load.
  // Example: --vus 50 --duration 5m
  // The thresholds below are for reference and must be adjusted based on your actual test results.
  thresholds: {
    // Fail the test if the rate of failed HTTP requests is greater than 1%.
    http_req_failed: ['rate<0.01'],

    // How to adjust p(95) and p(90) thresholds:
    // After running a test, look at the output summary. Let's say for 50 VUs,
    // your p(95) is 450ms. You can then set your threshold to a slightly
    // higher number, for example: 'p(95)<500'. As you increase VUs, this number
    // will likely increase, and you will need to adjust your threshold accordingly.
    
    // Initial threshold for paginated GET requests.
    // This value should be updated after you get initial results.
    'get_paginated_data_duration': ['p(95)<1000', 'p(90)<500'],

    // Example thresholds for other endpoints
    'get_serial_code_headers_duration': ['p(95)<500', 'p(90)<200'],
    'post_generate_duration': ['p(95)<1000', 'p(90)<500'],
  },
};

/**
 * The main entry point for the k6 test.
 * The script will be executed repeatedly by the virtual users.
 */
export default function () {
  // Use 'group' to logically organize related API calls.
  group('Durotrace API Performance Tests', () => {

    // Group 1: Testing a hypothetical paginated endpoint
    // NOTE: You must update the URL with your actual paginated API endpoint.
    group('GET - Get Paginated Data', () => {
      // Assuming your paginated API takes page and pageSize as query parameters.
      // Example: .../api/items?page=1&pageSize=10
      const page = Math.floor(Math.random() * 100) + 1; // Simulate fetching a random page
      const pageSize = 50; // The number of items per page
      const paginatedUrl = `${BASE_URL}/api/serialcode/get-serial-codes-data?page=${page}&pageSize=${pageSize}`;

      const res = http.get(paginatedUrl, {
        headers: { 'Content-Type': 'application/json' },
      });
      getPaginatedDataTrend.add(res.timings.duration);
      check(res, {
        'Paginated GET status is 200': (r) => r.status === 200,
        'Paginated GET has non-empty body': (r) => r.body.length > 0,
      });
    });

    // Group 2: Testing the 'Get Serial Code Headers' endpoint
    group('GET - Get Serial Code Headers', () => {
      const res = http.get(`${BASE_URL}/api/serialcode/get-serial-code-headers-data`, {
        headers: { 'Content-Type': 'application/json' },
      });
      getHeadersTrend.add(res.timings.duration);
      check(res, {
        'GET headers status is 200': (r) => r.status === 200,
        'GET headers has non-empty body': (r) => r.body.length > 0,
      });
    });

    // Group 3: Testing the 'Generate Serial Codes' endpoint
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
      postGenerateTrend.add(res.timings.duration);
      check(res, {
        'POST generate status is 201': (r) => r.status === 201,
        'POST generate has non-empty body': (r) => r.body.length > 0,
      });
    });
  });
}
