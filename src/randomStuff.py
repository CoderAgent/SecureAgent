import random  
import string  
import json  
import math  

def generate_random_number(min_value=1, max_value=100):  
    """Generate a random number between min_value and max_value."""  
    return random.randint(min_value, max_value)  

def generate_random_string(length=10):  
    """Generate a random string of a specified length."""  
    letters = string.ascii_letters  # Uppercase and lowercase letters  
    return ''.join(random.choice(letters) for i in range(length))  

def create_random_list(size=5, min_value=1, max_value=50):  
    """Create a list of random integers."""  
    return [generate_random_number(min_value, max_value) for _ in range(size)]  

def calculate_factorial(n):  
    """Calculate the factorial of a number."""  
    if n < 0:  
        return None  
    return math.factorial(n)  

def write_to_json_file(data, filename='data.json'):  
    """Write a dictionary to a JSON file."""  
    with open(filename, 'w') as file:  
        json.dump(data, file, indent=4)  

def read_from_json_file(filename='data.json'):  
    """Read data from a JSON file."""  
    with open(filename, 'r') as file:  
        return json.load(file)  

def main():  
    # Generate some random numbers and strings  
    random_number = generate_random_number()  
    random_string = generate_random_string()  
    random_list = create_random_list()  
    
    print(f"Random Number: {random_number}")  
    print(f"Random String: {random_string}")  
    print(f"Random List: {random_list}")  

    # Calculate factorial for a random number  
    factorial_of = random.choice(random_list)  
    factorial_value = calculate_factorial(factorial_of)  
    print(f"Factorial of {factorial_of}: {factorial_value}")  

    # Write some data to a JSON file  
    data = {  
        "random_number": random_number,  
        "random_string": random_string,  
        "random_list": random_list,  
        "factorial_value": factorial_value  
    }  
    write_to_json_file(data)  

    # Read the data back from the JSON file  
    loaded_data = read_from_json_file()  
    print("Data loaded from JSON file:")  
    print(json.dumps(loaded_data, indent=4))  

if __name__ == "__main__":  
    main()