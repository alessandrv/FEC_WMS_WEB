#!/usr/bin/env python
"""
Test script for the new shelf inspection API endpoints.
This script tests all the new API endpoints without modifying production data.
"""

import sys
import requests
import json
from datetime import datetime, timedelta

# Update with your server address
BASE_URL = "http://localhost:5000"

def test_get_all_inspections():
    """Test getting all shelf inspections"""
    print("\n=== Testing GET /api/shelf-inspection endpoint ===")
    
    response = requests.get(f"{BASE_URL}/api/shelf-inspection")
    
    if response.status_code == 200:
        data = response.json()
        print(f"Success! Retrieved {len(data)} shelf inspections")
        if data:
            print("Sample inspection:")
            sample = data[0]
            for key, value in sample.items():
                print(f"  {key}: {value}")
    else:
        print(f"Error: {response.status_code}")
        print(response.text)

def test_get_single_inspection(shelf_id):
    """Test getting a single shelf inspection"""
    print(f"\n=== Testing GET /api/shelf-inspection/{shelf_id} endpoint ===")
    
    response = requests.get(f"{BASE_URL}/api/shelf-inspection/{shelf_id}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"Success! Retrieved inspection for shelf {shelf_id}")
        for key, value in data.items():
            print(f"  {key}: {value}")
    else:
        print(f"Error: {response.status_code}")
        print(response.text)

def test_get_inspection_questions(shelf_id):
    """Test getting inspection questions for a shelf"""
    print(f"\n=== Testing GET /api/shelf-inspection-questions/{shelf_id} endpoint ===")
    
    response = requests.get(f"{BASE_URL}/api/shelf-inspection-questions/{shelf_id}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"Success! Retrieved {len(data)} questions for shelf {shelf_id}")
        if data:
            print("Sample questions:")
            for i, question in enumerate(data[:3]):  # Show first 3 questions
                print(f"  Question {i+1}:")
                for key, value in question.items():
                    print(f"    {key}: {value}")
                if i < 2 and i < len(data) - 1:  # Add separator between questions
                    print()
    else:
        print(f"Error: {response.status_code}")
        print(response.text)

def test_get_inspection_history(shelf_id):
    """Test getting inspection history for a shelf"""
    print(f"\n=== Testing GET /api/shelf-inspection-history/{shelf_id} endpoint ===")
    
    response = requests.get(f"{BASE_URL}/api/shelf-inspection-history/{shelf_id}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"Success! Retrieved {len(data)} historical inspections for shelf {shelf_id}")
        if data:
            print("Sample history:")
            for i, inspection in enumerate(data[:2]):  # Show first 2 inspection records
                print(f"  Inspection {i+1}:")
                for key, value in inspection.items():
                    if key == 'questions':
                        print(f"    {key}: {len(value)} questions")
                    else:
                        print(f"    {key}: {value}")
                if i < 1 and i < len(data) - 1:  # Add separator between inspections
                    print()
    else:
        print(f"Error: {response.status_code}")
        print(response.text)

def test_save_inspection(shelf_id, read_only=True):
    """Test saving a new inspection for a shelf
    
    Args:
        shelf_id: The ID of the shelf to inspect
        read_only: If True, only prints the request without sending it
    """
    print(f"\n=== Testing POST /api/shelf-inspection/{shelf_id} endpoint ===")
    
    # Create test data
    inspection_date = datetime.now().strftime('%Y-%m-%d')
    
    payload = {
        "status": "OK",
        "questions": [
            {
                "question": "Shelf is clean?",
                "answer": "SI",
                "notes": "Test note for question 1"
            },
            {
                "question": "Products are properly organized?",
                "answer": "SI",
                "notes": ""
            },
            {
                "question": "Any damaged products?",
                "answer": "NO",
                "notes": "Test note for question 3"
            }
        ]
    }
    
    print("Request payload:")
    print(json.dumps(payload, indent=2))
    
    if read_only:
        print("\nTest run only - no request sent to avoid modifying data.")
        print("To actually send the request, run with read_only=False")
        return
    
    response = requests.post(
        f"{BASE_URL}/api/shelf-inspection/{shelf_id}",
        json=payload
    )
    
    if response.status_code == 200:
        data = response.json()
        print("Success! Inspection saved:")
        print(json.dumps(data, indent=2))
    else:
        print(f"Error: {response.status_code}")
        print(response.text)

def main():
    # Get a shelf ID to test with
    if len(sys.argv) > 1:
        test_shelf_id = sys.argv[1]
    else:
        # Try to find a shelf ID from the API
        try:
            response = requests.get(f"{BASE_URL}/api/shelf-inspection")
            if response.status_code == 200:
                data = response.json()
                if data:
                    test_shelf_id = data[0]['scaffale']
                    print(f"Using shelf ID '{test_shelf_id}' for testing")
                else:
                    test_shelf_id = "A01"
                    print(f"No shelves found, using default '{test_shelf_id}' for testing")
            else:
                test_shelf_id = "A01"
                print(f"Error fetching shelves, using default '{test_shelf_id}' for testing")
        except Exception as e:
            test_shelf_id = "A01"
            print(f"Exception: {e}")
            print(f"Using default shelf ID '{test_shelf_id}' for testing")
    
    # Run tests
    test_get_all_inspections()
    test_get_single_inspection(test_shelf_id)
    test_get_inspection_questions(test_shelf_id)
    test_get_inspection_history(test_shelf_id)
    
    # Test saving an inspection without actually sending the request
    test_save_inspection(test_shelf_id, read_only=True)
    
    print("\nAll tests completed")

if __name__ == "__main__":
    main() 