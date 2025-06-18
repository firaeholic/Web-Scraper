from flask import Flask, request, jsonify
from flask_cors import CORS
from pymongo import MongoClient
from datetime import datetime
import requests
from bs4 import BeautifulSoup
import re

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# MongoDB connection
client = MongoClient('mongodb://localhost:27017')
db = client['ScrapedData']
collection = db['Data']

@app.route('/scrape', methods=['POST'])
def scrape_books():
    try:
        data = request.get_json()
        url = data.get('url')
        category = data.get('category')
        
        if not url:
            return jsonify({'error': 'URL is required'}), 400
        
        # Send GET request to the URL
        response = requests.get(url)
        response.raise_for_status()
        
        # Parse HTML content
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Find all book containers
        books = soup.find_all('article', class_='product_pod')
        
        scraped_books = []
        
        for book in books:
            # Extract title
            title_element = book.find('h3').find('a')
            title = title_element.get('title') if title_element else 'N/A'
            
            # Extract price
            price_element = book.find('p', class_='price_color')
            price_text = price_element.text if price_element else '£0.00'
            # Strip currency symbols and convert to float
            price = re.sub(r'[^\d.]', '', price_text)
            
            # Extract availability
            availability_element = book.find('p', class_='instock availability')
            availability = availability_element.text.strip() if availability_element else 'N/A'
            
            # Create book document
            book_doc = {
                'title': title,
                'price': price,
                'availability': availability,
                'category': category or 'General',
                'source': url,
                'timestamp': datetime.utcnow().isoformat()
            }
            
            scraped_books.append(book_doc)
        
        # Insert into MongoDB
        if scraped_books:
            collection.insert_many(scraped_books)
        
        return jsonify({
            'success': True,
            'message': f'Successfully scraped {len(scraped_books)} books',
            'count': len(scraped_books)
        })
        
    except requests.RequestException as e:
        return jsonify({'error': f'Failed to fetch URL: {str(e)}'}), 400
    except Exception as e:
        return jsonify({'error': f'An error occurred: {str(e)}'}), 500

@app.route('/data', methods=['GET'])
def get_data():
    try:
        # Fetch all documents from the collection
        documents = list(collection.find({}, {'_id': 0}))  # Exclude MongoDB _id field
        
        return jsonify({
            'success': True,
            'data': documents,
            'count': len(documents)
        })
        
    except Exception as e:
        return jsonify({'error': f'An error occurred: {str(e)}'}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)