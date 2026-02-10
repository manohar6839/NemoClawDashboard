import os
import requests
import json
import time
from datetime import datetime, timedelta
from dotenv import load_dotenv

# Load .env from project root
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), '.env'))

# Configuration
API_KEY = os.getenv('API_KEY')
API_BASE_URL = os.getenv('API_BASE_URL', 'https://api.example.com/v1')
REPORT_INTERVAL_DAYS = 7

def get_api_usage(start_date, end_date):
    """Fetch API usage data for the given date range"""
    url = f"{API_BASE_URL}/usage?start_date={start_date}&end_date={end_date}"
    headers = {'Authorization': f'Bearer {API_KEY}'}
    response = requests.get(url, headers=headers)
    return response.json()

def calculate_costs(usage_data):
    """Calculate the estimated costs based on the API usage"""
    total_cost = 0
    for endpoint, usage in usage_data.items():
        calls = usage['total_calls']
        cost_per_call = usage['cost_per_call']
        endpoint_cost = calls * cost_per_call
        total_cost += endpoint_cost
        print(f"Endpoint: {endpoint} | Calls: {calls} | Cost: ${endpoint_cost:.2f}")
    return total_cost

def main():
    """Main function to generate a usage report"""
    end_date = datetime.now().date()
    start_date = end_date - timedelta(days=REPORT_INTERVAL_DAYS)
    usage_data = get_api_usage(start_date.isoformat(), end_date.isoformat())
    total_cost = calculate_costs(usage_data)
    print(f"Total estimated cost for the last {REPORT_INTERVAL_DAYS} days: ${total_cost:.2f}")

if __name__ == '__main__':
    main()