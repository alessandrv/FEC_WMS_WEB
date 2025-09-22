#!/usr/bin/env python3
"""
Test script for the new inspection system API
Tests the v2 endpoints for cycle management and shelf inspections
"""

import requests
import json
import sys
from datetime import date

def test_inspection_system():
    """Test the new inspection system API endpoints"""
    base_url = "http://localhost:5000/api/v2"
    
    print("🧪 Testing New Inspection System API v2")
    print("=" * 50)
    
    # Test 1: Check cycle creation status
    print("\n1. Testing cycle creation status...")
    try:
        response = requests.get(f"{base_url}/inspection-cycles/status")
        if response.status_code == 200:
            result = response.json()
            if result.get('success'):
                print(f"✅ Status check successful")
                print(f"   Can create cycle: {result.get('can_create')}")
                print(f"   Message: {result.get('message')}")
            else:
                print(f"❌ Status check failed: {result.get('error')}")
        else:
            print(f"❌ HTTP {response.status_code}: {response.text}")
    except Exception as e:
        print(f"❌ Connection error: {str(e)}")
    
    # Test 2: Get existing cycles
    print("\n2. Testing get cycles...")
    try:
        response = requests.get(f"{base_url}/inspection-cycles")
        if response.status_code == 200:
            result = response.json()
            if result.get('success'):
                cycles = result.get('cycles', [])
                print(f"✅ Found {len(cycles)} cycles")
                for cycle in cycles:
                    print(f"   - {cycle.get('cycle_name')} (Active: {cycle.get('is_active')})")
            else:
                print(f"❌ Get cycles failed: {result.get('error')}")
        else:
            print(f"❌ HTTP {response.status_code}: {response.text}")
    except Exception as e:
        print(f"❌ Connection error: {str(e)}")
    
    # Test 3: Get inspection questions
    print("\n3. Testing get questions...")
    try:
        response = requests.get(f"{base_url}/inspection-questions")
        if response.status_code == 200:
            result = response.json()
            if result.get('success'):
                questions = result.get('questions', [])
                print(f"✅ Found {len(questions)} questions")
                for q in questions[:3]:  # Show first 3
                    print(f"   - {q.get('question_text')}")
                if len(questions) > 3:
                    print(f"   ... and {len(questions) - 3} more")
            else:
                print(f"❌ Get questions failed: {result.get('error')}")
        else:
            print(f"❌ HTTP {response.status_code}: {response.text}")
    except Exception as e:
        print(f"❌ Connection error: {str(e)}")
    
    # Test 4: Try creating a new cycle
    print("\n4. Testing cycle creation...")
    try:
        cycle_data = {
            'cycle_name': f'Ciclo Test {date.today().strftime("%B %Y")}',
            'notes': 'Ciclo creato durante i test del sistema'
        }
        response = requests.post(f"{base_url}/inspection-cycles", json=cycle_data)
        if response.status_code == 200:
            result = response.json()
            if result.get('success'):
                print(f"✅ Cycle created successfully")
                print(f"   ID: {result.get('cycle_id')}")
                print(f"   Name: {result.get('cycle_name')}")
            else:
                print(f"❌ Cycle creation failed: {result.get('error')}")
        else:
            print(f"❌ HTTP {response.status_code}: {response.text}")
    except Exception as e:
        print(f"❌ Connection error: {str(e)}")
    
    # Test 5: Get shelf inspections for active cycle
    print("\n5. Testing get shelf inspections...")
    try:
        response = requests.get(f"{base_url}/shelf-inspections")
        if response.status_code == 200:
            result = response.json()
            if result.get('success'):
                inspections = result.get('inspections', [])
                cycle = result.get('cycle', {})
                print(f"✅ Found {len(inspections)} inspections in cycle '{cycle.get('name')}'")
            else:
                print(f"❌ Get inspections failed: {result.get('error')}")
        else:
            print(f"❌ HTTP {response.status_code}: {response.text}")
    except Exception as e:
        print(f"❌ Connection error: {str(e)}")
    
    # Test 6: Test a specific shelf inspection
    print("\n6. Testing shelf inspection details...")
    try:
        shelf_id = "A001"  # Test shelf
        response = requests.get(f"{base_url}/shelf-inspections/{shelf_id}")
        if response.status_code == 200:
            result = response.json()
            if result.get('success'):
                inspection = result.get('inspection', {})
                print(f"✅ Shelf {shelf_id} inspection details retrieved")
                print(f"   Status: {inspection.get('status')}")
                print(f"   Questions: {len(inspection.get('questions', []))}")
            else:
                print(f"❌ Get shelf inspection failed: {result.get('error')}")
        else:
            print(f"❌ HTTP {response.status_code}: {response.text}")
    except Exception as e:
        print(f"❌ Connection error: {str(e)}")
    
    print("\n" + "=" * 50)
    print("🎯 Test completed!")
    print("\nNext steps:")
    print("1. Configure database connection properly")
    print("2. Verify tables exist: wms_inspection_cycles, wms_shelf_inspections, etc.")
    print("3. Update frontend components to use /api/v2/ endpoints")

if __name__ == "__main__":
    test_inspection_system()