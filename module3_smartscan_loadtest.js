import http from 'k6/http';
import { check, group, sleep } from 'k6';

// Base URL for the Durotrace API
const BASE_URL = 'https://dev-durotrace-api.azurewebsites.net';

// Define the remaining Smart Scan Capture Endpoints
const SMART_SCAN_CAPTURE_GENERATE_ENDPOINT = `${BASE_URL}/api/smartscancapture/generate`;
// SMART_SCAN_CAPTURE_SCAN_ENDPOINT has been removed as requested.
const SMART_SCAN_CAPTURE_GET_HEADERS_ENDPOINT = `${BASE_URL}/api/smartscancapture/get-po-headers-data`;
const SMART_SCAN_CAPTURE_GET_DETAILS_ENDPOINT = `${BASE_URL}/api/smartscancapture/get-po-details-data`;
const SMART_SCAN_CAPTURE_MRP_REPRINT_ENDPOINT = `${BASE_URL}/api/smartscancapture/mrp-reprint`;

/**
 * Define the load test options, including the number of users, duration, and thresholds.
 */
export const options = {
    // Ramp-up to 20 users over 60s, hold for 60s, ramp-down over 30s
    stages: [
        { duration: '60s', target: 20 }, // Ramp up to 20 VUs
        { duration: '60s', target: 20 }, // Stay at 20 VUs
        { duration: '30s', target: 0 },  // Ramp down to 0 VUs
    ],
    
    // Performance goals (Thresholds)
    thresholds: {
        // 95% of all requests must complete within 2000ms (2 seconds)
        'http_req_duration': ['p(95)<2000'],
        // The failure rate must be less than 1.0%
        'http_req_failed': ['rate<0.01'], 
        // 99% of requests must return a successful status code (2xx)
        'checks': ['rate>0.99'],
    },
    
    // Output the results to a JSON file for report generation
    ext: {
        loadimpact: {
            projectID: 3568600, // Replace with your k6 Cloud Project ID if using Cloud
            name: 'Durotrace Smart Scan Capture Combined Test (Scan Removed)', 
        },
    },
};

/**
 * Generates the specific complex payload for the /api/smartscancapture/generate endpoint.
 * The ordernumber is made unique and numeric-only for safer load testing.
 */
function generateOrderPayload() {
    // Generate a numeric order number: Start with a base, and add a unique number based on VU and ITER.
    const numericPart = (__VU * 10000 + __ITER);
    const uniqueOrderNumber = `123456789${numericPart}`; 

    return JSON.stringify({
        "order": [
            {
                "transactiontype": "PURCHASE_ORDER",
                "ordernumber": uniqueOrderNumber, // <-- Dynamic (numeric-only)
                "orderdate": "18/08/2025",
                "ordertime": "12:16:22",
                "plantcode": "P003",
                "prodorderstatus": "",
                "storagelocation": "RM03",
                "vendorCode": "200128    ",
                "vendorName": "GLOBAL TEXTILES ALLIANCE PVT LTD",
                "items": [
                    {
                        "itemnumber": "10",
                        "materialcode": "CB88SHFLIBLENDGJ03651C001025250GSMG",
                        "materialdescription": "CB88SHFLI BLEND GJ03651-C001025 250GSM",
                        "orderedquantity": 1000,
                        "confirmedgrqty": 1000,
                        "storagelocation": "RM03",
                        "uom": "M",
                        "ordernumber": uniqueOrderNumber, // <-- Dynamic (numeric-only)
                        "lineorderstatus": "C",
                        "content": "",
                        "category": "",
                        "model": "",
                        "productcode": "",
                        "dimension": "",
                        "netqty": 1,
                        "monthyear": "",
                        "mrp": 0,
                        "eannumber": "",
                        "mfgplantadd": "",
                        "customercare": "",
                        "l1code": "99",
                        "l1text": "To be Created",
                        "l2code": "9999",
                        "l2text": "To be Created",
                        "l3code": "999999",
                        "l3text": "To be Created",
                        "l4code": "99999999",
                        "l4text": "To be Created",
                        "l5code": "999999999999",
                        "l5text": "To be Created",
                        "l6code": "99999999999999999",
                        "l6text": "To be Created",
                        "remarks": "",
                        "attr1": "0.000 ",
                        "attr2": "0.000 ",
                        "attr3": "0.000 ",
                        "attr4": "",
                        "attr5": "",
                        "type": 0
                    }
                ]
            },
        ]
    });
}

/**
 * Generates a specific payload for the /mrp-reprint endpoint.
 * Serial number is randomized to simulate unique reprint requests.
 */
function generateMrpReprintPayload() {
    return JSON.stringify({
        "po_details_code": "a6dd5d05-318f-4bca-833d-48d01aea97a3",
        // Append VU and ITER to ensure the serial number is unique for each request
        "serial_number": `P00302H4QhG6M1b00E-${__VU}-${__ITER}` 
    });
}

/**
 * The default function runs repeatedly by each Virtual User (VU).
 */
export default function () {
    const orderPayload = generateOrderPayload();
    const mrpReprintPayload = generateMrpReprintPayload();

    const postParams = {
        headers: {
            'Content-Type': 'application/json',
            // 'Authorization': 'Bearer YOUR_API_TOKEN', 
        }
    };

    // Main group for Smart Scan Capture Module
    group('Module 3: Smart Scan Capture - Combined Tests', function () {
        
        // --- 1. POST Endpoints (Write/Action) --- (2 Endpoints remaining)
        group('POST Endpoints (Write/Action)', function() {
            
            // 1.1. Test POST /api/smartscancapture/generate
            const generateParams = {
                ...postParams,
                tags: { name: 'Smart Scan Generate POST' }
            };
            const resGenerate = http.post(SMART_SCAN_CAPTURE_GENERATE_ENDPOINT, orderPayload, generateParams);

            // --- DEBUGGING: Log failure details for the failing /generate endpoint ---
            if (resGenerate.status >= 400) {
                console.log(`[GENERATE FAIL] Status: ${resGenerate.status}, Body: ${resGenerate.body}`);
            }
            // --- END DEBUGGING ---

            check(resGenerate, {
                'Generate: status is 200/201': (r) => r.status === 200 || r.status === 201,
            });

            // 1.2. Test POST /api/smartscancapture/mrp-reprint
            const mrpParams = {
                ...postParams,
                tags: { name: 'Smart Scan MRP Reprint POST' }
            };
            const resMrp = http.post(SMART_SCAN_CAPTURE_MRP_REPRINT_ENDPOINT, mrpReprintPayload, mrpParams);

            check(resMrp, {
                'MRP Reprint: status is 200/201': (r) => r.status === 200 || r.status === 201,
            });
        });

        // --- 2. GET Endpoints (Data Retrieval) --- (2 Endpoints)
        group('GET Endpoints (Data Retrieval)', function() {
            
            // 2.1. Test GET /api/smartscancapture/get-po-headers-data
            const headersParams = { tags: { name: 'Smart Scan GET PO Headers' } };
            const resHeaders = http.get(SMART_SCAN_CAPTURE_GET_HEADERS_ENDPOINT, headersParams);
            
            check(resHeaders, {
                'GET PO Headers status is 200': (r) => r.status === 200,
                'GET PO Headers has non-empty body': (r) => r.body.length > 0,
            });

            // 2.2. Test GET /api/smartscancapture/get-po-details-data
            const detailsParams = { tags: { name: 'Smart Scan GET PO Details' } };
            const resDetails = http.get(SMART_SCAN_CAPTURE_GET_DETAILS_ENDPOINT, detailsParams);
            
            check(resDetails, {
                'GET PO Details status is 200': (r) => r.status === 200,
                'GET PO Details has non-empty body': (r) => r.body.length > 0,
            });
        });

        // Add a small delay between the combined requests in this iteration
        sleep(1);
    });
}
