#!/usr/bin/env python3
"""Test script to debug authentication endpoint"""

import requests

# Test the authentication endpoint with different formats
url = "http://localhost:8000/token"

print("Testing authentication endpoint...")

# Test 1: Form data (like curl)
print("\n1. Testing with form data:")
try:
    response = requests.post(
        url,
        data={"username": "devuser", "password": "devpass"},
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")
except Exception as e:
    print(f"Error: {e}")

# Test 2: JSON data (should fail but let's see)
print("\n2. Testing with JSON data:")
try:
    response = requests.post(
        url,
        json={"username": "devuser", "password": "devpass"}
    )
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")
except Exception as e:
    print(f"Error: {e}")

# Test 3: Multipart form data
print("\n3. Testing with multipart form data:")
try:
    response = requests.post(
        url,
        data={"username": "devuser", "password": "devpass"}
    )
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")
except Exception as e:
    print(f"Error: {e}")

# Test 4: Health endpoint (should work)
print("\n4. Testing health endpoint:")
try:
    response = requests.get("http://localhost:8000/health")
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text[:100]}...")
except Exception as e:
    print(f"Error: {e}")