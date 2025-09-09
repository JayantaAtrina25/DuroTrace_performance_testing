import json
import sys
import re
import os
import numpy as np
from collections import defaultdict

def generate_report(results_files):
    """
    Reads multiple streaming k6 JSON files, aggregates metrics for each module,
    and generates a single, comprehensive HTML report.

    Args:
        results_files (list): A list of paths to the k6 JSON output files.
    """
    
    # Check if the list of files is empty.
    if not results_files:
        print("Error: No result files were provided.")
        sys.exit(1)

    # Dictionary to hold the aggregated metrics for all modules
    all_modules_metrics = {}

    # Global counters for overall summary
    global_total_requests = 0
    global_failed_requests = 0
    global_total_durations = []
    global_max_vus = 0
    global_data_sent = 0
    global_data_received = 0
    global_thresholds = {}
    
    # Flag to track if any module fails the p95 threshold check
    p95_duration_threshold_passed = True

    for results_file in results_files:
        if not os.path.exists(results_file):
            print(f"Error: The file '{results_file}' was not found. Skipping this file.")
            continue

        print(f"Processing results from '{results_file}'...")

        # Initialize a data structure for the current module's metrics
        module_metrics = {
            'http_reqs': 0,
            'http_req_failed': 0,
            'http_req_durations': [],
            'group_durations': defaultdict(lambda: {'values': [], 'final_avg': 0}),
            'group_failures': defaultdict(int),
            'max_vus': 0,
            'data_sent': 0,
            'data_received': 0
        }

        try:
            with open(results_file, 'r') as f:
                file_content = f.read()
                
                # Use regex to wrap the series of JSON objects in a valid JSON array format.
                json_objects_str = '[' + re.sub(r'}\s*{', '},{', file_content.strip()) + ']'
                
                # Parse the entire file content as a single JSON array.
                data_points = json.loads(json_objects_str)

        except IOError as e:
            print(f"Error reading the file '{results_file}': {e}")
            continue
        except json.JSONDecodeError as e:
            print(f"Error decoding JSON from '{results_file}'. The file may be malformed. Error: {e}")
            continue
        
        # --- AGGREGATE RAW DATA FROM EACH DATA POINT FOR THE CURRENT MODULE ---
        for data_point in data_points:
            metric_name = data_point.get('metric')
            data = data_point.get('data', {})
            data_type = data_point.get('type')

            if data_type == 'Point':
                if metric_name == 'http_reqs' and data.get('value') == 1:
                    module_metrics['http_reqs'] += 1
                
                elif metric_name == 'http_req_failed' and data.get('value') == 1:
                    module_metrics['http_req_failed'] += 1
                    if 'tags' in data and 'group' in data['tags']:
                        group_name = data['tags']['group']
                        module_metrics['group_failures'][group_name] += 1
                
                elif metric_name == 'http_req_duration' and 'value' in data:
                    module_metrics['http_req_durations'].append(data['value'])
                
                elif metric_name == 'group_duration' and 'tags' in data and 'value' in data:
                    group_name = data['tags']['group']
                    module_metrics['group_durations'][group_name]['values'].append(data['value'])
                
                elif metric_name == 'vus' and 'value' in data:
                    module_metrics['max_vus'] = max(module_metrics['max_vus'], data['value'])
                
                elif metric_name == 'data_sent' and 'value' in data:
                    module_metrics['data_sent'] += data['value']
                
                elif metric_name == 'data_received' and 'value' in data:
                    module_metrics['data_received'] += data['value']

            elif data_type == 'Metric' and 'thresholds' in data:
                global_thresholds[metric_name] = data['thresholds']

        # Calculate final average duration for each group in this module
        for group_name, group_data in module_metrics['group_durations'].items():
            if group_data['values']:
                group_data['final_avg'] = np.mean(group_data['values'])
        
        # Add the module's metrics to the main dictionary
        module_name = os.path.splitext(os.path.basename(results_file))[0].replace('k6_results_', '').replace('_', ' ').title()
        all_modules_metrics[module_name] = module_metrics

        # Update global totals for the summary section
        global_total_requests += module_metrics['http_reqs']
        global_failed_requests += module_metrics['http_req_failed']
        global_total_durations.extend(module_metrics['http_req_durations'])
        global_max_vus = max(global_max_vus, module_metrics['max_vus'])
        global_data_sent += module_metrics['data_sent']
        global_data_received += module_metrics['data_received']

    # --- CALCULATE GLOBAL SUMMARY STATISTICS ---
    global_passed_requests = global_total_requests - global_failed_requests
    data_sent_mb = global_data_sent / (1024 * 1024)
    data_received_mb = global_data_received / (1024 * 1024)

    if global_total_durations:
        avg_response_time = np.mean(global_total_durations)
        global_p95_response_time = np.percentile(global_total_durations, 95)
    else:
        avg_response_time = 0
        global_p95_response_time = 0
    
    # --- CHECK THRESHOLDS AND GENERATE DYNAMIC LABELS ---
    http_failure_rate_passed = False
    http_failure_label = "HTTP Failure Rate (No threshold defined)"
    p95_duration_label = "95th Percentile Duration (No threshold defined)"
    p95_threshold_value = None

    # Find the p95 threshold value
    if 'http_req_duration' in global_thresholds:
        for threshold_str in global_thresholds['http_req_duration']:
            match = re.search(r'p\(95\)<(\d+)', threshold_str)
            if match:
                p95_threshold_value = float(match.group(1))
                p95_duration_label = f"95th Percentile Duration (Goal: < {p95_threshold_value}ms)"
                break
    
    # Check the p95 duration threshold against each module's results
    if p95_threshold_value is not None:
        # Loop through each module's metrics and check its p95
        for module_name, metrics in all_modules_metrics.items():
            if metrics['http_req_durations']:
                module_p95 = np.percentile(metrics['http_req_durations'], 95)
                if module_p95 > p95_threshold_value:
                    p95_duration_threshold_passed = False
                    break # A single failure is enough to fail the overall check
            else:
                p95_duration_threshold_passed = False # No requests means a failure in some sense
    else:
        p95_duration_threshold_passed = True # No threshold defined, so it technically "passes"

    if 'http_req_failed' in global_thresholds:
        for threshold_str in global_thresholds['http_req_failed']:
            match = re.search(r'rate<([\d.]+)', threshold_str)
            if match:
                threshold_value = float(match.group(1))
                failure_rate = global_failed_requests / global_total_requests if global_total_requests > 0 else 0
                http_failure_rate_passed = failure_rate < threshold_value
                http_failure_label = f"HTTP Failure Rate (Goal: < {threshold_value*100:.2f}%)"
                break

    # Set threshold status strings and colors for the HTML report.
    http_failure_status = "Passed" if http_failure_rate_passed else "Failed"
    http_failure_color = "bg-green-100 text-green-800" if http_failure_rate_passed else "bg-red-100 text-red-800"
    
    p95_duration_status = "Passed" if p95_duration_threshold_passed else "Failed"
    p95_duration_color = "bg-green-100 text-green-800" if p95_duration_threshold_passed else "bg-red-100 text-red-800"

    # --- GENERATE DETAILED TABLE ROWS FOR EACH MODULE ---
    all_tables_html = ""
    for module_name, metrics in all_modules_metrics.items():
        table_rows = ""
        for group_name, group_data in metrics['group_durations'].items():
            if "::" not in group_name:
                continue
            
            endpoint_name = group_name.split("::")[-1].strip()
            avg_time = group_data['final_avg']
            
            # Determine status based on failures for this group
            failed_requests_for_group = metrics['group_failures'][group_name]
            status = "Failed" if failed_requests_for_group > 0 else "Passed"
            status_color = "bg-red-100 text-red-800" if status == "Failed" else "bg-green-100 text-green-800"
            
            table_rows += f"""
                        <tr class="hover:{'bg-green-50' if status == 'Passed' else 'bg-red-50'}">
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{endpoint_name}</td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full {status_color}">{status}</span>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{avg_time:.2f} ms</td>
                        </tr>
            """
        
        all_tables_html += f"""
        <h2 class="text-2xl font-bold text-gray-700 mb-4 mt-8">{module_name} Performance</h2>
        <div class="overflow-x-auto">
            <table class="min-w-full bg-white rounded-lg shadow-md overflow-hidden">
                <thead class="bg-gray-200">
                    <tr>
                        <th class="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Endpoint Group</th>
                        <th class="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                        <th class="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Avg. Time Taken</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-200">
                    {table_rows}
                </tbody>
            </table>
        </div>
        """

    # --- BUILD THE FINAL HTML REPORT ---
    html_content = f"""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>K6 Load Test Report</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body {{ font-family: 'Inter', sans-serif; background-color: #f3f4f6; }}
    </style>
</head>
<body class="p-4 sm:p-8">
    <div class="max-w-4xl mx-auto bg-white rounded-xl shadow-lg p-6 sm:p-10">
        <h1 class="text-3xl sm:text-4xl font-extrabold text-center text-gray-800 mb-6">Durotrace API Load Test Report</h1>
        
        <!-- Overall Summary Section with Global Metrics -->
        <h2 class="text-2xl font-bold text-gray-700 mb-4">Overall Test Summary</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8 text-center">
            <div class="bg-blue-100 text-blue-800 p-4 rounded-lg shadow-md">
                <p class="text-sm font-semibold">Total Requests</p>
                <p class="text-2xl font-bold">{global_total_requests}</p>
            </div>
            <div class="bg-green-100 text-green-800 p-4 rounded-lg shadow-md">
                <p class="text-sm font-semibold">Requests Passed</p>
                <p class="text-2xl font-bold">{global_passed_requests}</p>
            </div>
            <div class="bg-red-100 text-red-800 p-4 rounded-lg shadow-md">
                <p class="text-sm font-semibold">Requests Failed</p>
                <p class="text-2xl font-bold">{global_failed_requests}</p>
            </div>
            <div class="bg-gray-100 text-gray-800 p-4 rounded-lg shadow-md">
                <p class="text-sm font-semibold">Avg. Response Time</p>
                <p class="text-2xl font-bold">{avg_response_time:.2f} ms</p>
            </div>
            <div class="bg-yellow-100 text-yellow-800 p-4 rounded-lg shadow-md">
                <p class="text-sm font-semibold">Max Virtual Users</p>
                <p class="text-2xl font-bold">{global_max_vus}</p>
            </div>
            <div class="bg-purple-100 text-purple-800 p-4 rounded-lg shadow-md">
                <p class="text-sm font-semibold">Data Sent</p>
                <p class="text-2xl font-bold">{data_sent_mb:.2f} MB</p>
            </div>
            <div class="bg-indigo-100 text-indigo-800 p-4 rounded-lg shadow-md">
                <p class="text-sm font-semibold">Data Received</p>
                <p class="text-2xl font-bold">{data_received_mb:.2f} MB</p>
            </div>
        </div>
        
        <!-- Threshold Status Section -->
        <h2 class="text-2xl font-bold text-gray-700 mb-4">Thresholds Summary</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            <div class="p-4 rounded-lg shadow-md {http_failure_color}">
                <p class="font-semibold text-gray-900">{http_failure_label}</p>
                <p class="text-lg font-bold">{http_failure_status}</p>
            </div>
            <div class="p-4 rounded-lg shadow-md {p95_duration_color}">
                <p class="font-semibold text-gray-900">{p95_duration_label}</p>
                <p class="text-lg font-bold">{p95_duration_status}</p>
            </div>
        </div>

        <!-- Detailed Results Tables based on k6 Modules -->
        {all_tables_html}
    </div>
</body>
</html>
"""

    # --- WRITE THE HTML FILE ---
    try:
        with open("report.html", "w") as file:
            file.write(html_content)
        print("Report successfully generated to report.html")
    except IOError as e:
        print(f"Error writing file: {e}")
        sys.exit(1)

if __name__ == "__main__":
    # Define the list of k6 result files to process.
    # The filenames are automatically used to label the tables in the report.
    result_files = ["k6_results.json", "k6_results_module1.json", "k6_results_module2.json"]
    generate_report(result_files)
