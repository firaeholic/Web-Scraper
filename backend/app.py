from flask import Flask, request, jsonify, Response
from flask_cors import CORS
from pymongo import MongoClient
from bs4 import BeautifulSoup
import requests
import re
from datetime import datetime
import json
import time
import threading
from queue import Queue

app = Flask(__name__)
CORS(app)

# Global progress tracking
progress_data = {
    'total_items': 0,
    'processed_items': 0,
    'ai_total': 0,
    'ai_processed': 0,
    'status': 'idle',
    'message': ''
}
progress_lock = threading.Lock()

def update_progress(total=None, processed=None, ai_total=None, ai_processed=None, status=None, message=None):
    """Update global progress data thread-safely"""
    with progress_lock:
        if total is not None:
            progress_data['total_items'] = total
        if processed is not None:
            progress_data['processed_items'] = processed
        if ai_total is not None:
            progress_data['ai_total'] = ai_total
        if ai_processed is not None:
            progress_data['ai_processed'] = ai_processed
        if status is not None:
            progress_data['status'] = status
        if message is not None:
            progress_data['message'] = message

@app.route('/progress')
def progress_stream():
    """Server-Sent Events endpoint for real-time progress updates"""
    def generate():
        while True:
            with progress_lock:
                data = progress_data.copy()
            
            # Calculate percentages
            scraping_percentage = 0
            ai_percentage = 0
            
            if data['total_items'] > 0:
                scraping_percentage = (data['processed_items'] / data['total_items']) * 100
            
            if data['ai_total'] > 0:
                ai_percentage = (data['ai_processed'] / data['ai_total']) * 100
            
            progress_info = {
                'total_items': data['total_items'],
                'processed_items': data['processed_items'],
                'ai_total': data['ai_total'],
                'ai_processed': data['ai_processed'],
                'scraping_percentage': round(scraping_percentage, 1),
                'ai_percentage': round(ai_percentage, 1),
                'status': data['status'],
                'message': data['message']
            }
            
            yield f"data: {json.dumps(progress_info)}\n\n"
            
            if data['status'] == 'completed' or data['status'] == 'error':
                break
                
            time.sleep(0.5)  # Update every 500ms
    
    response = Response(generate(), mimetype='text/event-stream')
    response.headers['Cache-Control'] = 'no-cache'
    response.headers['Connection'] = 'keep-alive'
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Cache-Control'
    return response

# Google Gemini AI configuration
GEMINI_API_KEY = "AIzaSyAw5Bp8qpNceQFQ3hGevcV2HCNfevhwONs"
GEMINI_API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}"

def extract_info_with_ai(title, content_type="movie"):
    """Extract movie/TV show information using Google Gemini AI"""
    try:
        # Prepare the prompt for Gemini AI
        prompt = f"""
        For the {content_type} titled "{title}", please provide accurate information in JSON format:
        {{
            "title": "exact title",
            "release_date": "release year or date range (for TV shows like 2014-2017)",
            "rating": "IMDb rating if available, otherwise N/A"
        }}
        
        Important: 
        - For TV shows, if it has multiple seasons, use date range format (like 2014-2017)
        - For movies, provide the release year
        - For rating, provide IMDb rating if known, otherwise use "N/A"
        - Only return valid JSON, no additional text
        - Be accurate with the information
        """
        
        # Prepare the request payload
        payload = {
            "contents": [{
                "parts": [{
                    "text": prompt
                }]
            }]
        }
        
        # Make the API request
        headers = {
            "Content-Type": "application/json"
        }
        
        response = requests.post(GEMINI_API_URL, json=payload, headers=headers, timeout=10)
        
        if response.status_code == 200:
            result = response.json()
            if 'candidates' in result and len(result['candidates']) > 0:
                ai_response = result['candidates'][0]['content']['parts'][0]['text']
                
                # Try to extract JSON from the AI response
                try:
                    # Remove any markdown formatting
                    ai_response = ai_response.strip()
                    if ai_response.startswith('```json'):
                        ai_response = ai_response[7:]
                    if ai_response.endswith('```'):
                        ai_response = ai_response[:-3]
                    
                    extracted_info = json.loads(ai_response.strip())
                    return extracted_info
                except json.JSONDecodeError:
                    print(f"Failed to parse AI response as JSON: {ai_response}")
                    return None
        
        return None
    except Exception as e:
        print(f"Error using AI extraction: {e}")
        return None  # Enable CORS for all routes

# MongoDB connection
client = MongoClient('mongodb://localhost:27017')
db = client['ScrapedData']
collection = db['Data']

def perform_scraping(url, category, content_type):
    """Perform scraping in a separate thread with progress tracking"""
    try:
        update_progress(status='starting', message='Initializing scraping...')
        
        # Send GET request to the URL
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        
        update_progress(status='parsing', message='Parsing HTML content...')
        
        # Parse HTML content
        soup = BeautifulSoup(response.content, 'html.parser')
        
        scraped_items = []
        
        if content_type == 'books':
            scraped_items = scrape_books_data(soup, url, category)
        elif content_type == 'movies':
            scraped_items = scrape_movies_data(soup, url, category)
        elif content_type == 'tvshows':
            scraped_items = scrape_tvshows_data(soup, url, category)
        
        # Insert into MongoDB
        if scraped_items:
            update_progress(status='saving', message='Saving to database...')
            collection.insert_many(scraped_items)
        
        update_progress(status='completed', message=f'Successfully scraped {len(scraped_items)} {content_type}')
        
    except Exception as e:
        update_progress(status='error', message=f'Error: {str(e)}')

@app.route('/scrape', methods=['POST'])
def scrape_content():
    try:
        data = request.get_json()
        url = data.get('url')
        category = data.get('category')
        content_type = data.get('contentType', 'books')
        
        if not url:
            return jsonify({'error': 'URL is required'}), 400
        
        # Reset progress
        update_progress(total=0, processed=0, ai_total=0, ai_processed=0, status='starting', message='Starting scrape...')
        
        # Start scraping in a separate thread
        scraping_thread = threading.Thread(target=perform_scraping, args=(url, category, content_type))
        scraping_thread.daemon = True
        scraping_thread.start()
        
        return jsonify({
            'success': True,
            'message': 'Scraping started. Use /progress endpoint for real-time updates.'
        })
        
    except Exception as e:
        return jsonify({'error': f'An error occurred: {str(e)}'}), 500

def scrape_books_data(soup, url, category):
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
            'contentType': 'books',
            'timestamp': datetime.now().isoformat()
        }
        
        scraped_books.append(book_doc)
    
    return scraped_books

def scrape_movies_data(soup, url, category):
    scraped_movies = []
    
    # Try different selectors for various movie sites
    # IMDB selectors
    movies = (soup.find_all('li', class_='ipc-metadata-list-summary-item') or 
              soup.find_all('td', class_='titleColumn') or 
              soup.find_all('li', class_='cli-item') or
              soup.find_all('div', class_='lister-item'))
    
    # If no IMDB-style elements found, try generic streaming site selectors
    if not movies:
        # Try broader selectors for streaming sites like hdtoday.to
        movies = (soup.find_all('div', class_='film-poster') or
                  soup.find_all('div', class_='movie-item') or
                  soup.find_all('div', class_='item') or
                  soup.find_all('article', class_='movie') or
                  soup.find_all('div', class_='card') or
                  soup.find_all('div', class_='flw-item') or
                  soup.find_all('div', class_='film_list-wrap') or
                  soup.find_all('a', class_='flw-item-img') or
                  soup.find_all('a', href=re.compile(r'/movie/|/watch/|/film/')) or
                  soup.select('div[class*="movie"]') or
                  soup.select('div[class*="film"]') or
                  soup.select('a[href*="/movie/"]') or
                  soup.select('a[href*="/watch/"]'))
    
    # Initialize progress tracking
    total_movies = len(movies)
    update_progress(total=total_movies, processed=0, status='scraping', message=f'Found {total_movies} movies to process')
    
    for index, movie in enumerate(movies):
        try:
            title = 'N/A'
            release_date = 'N/A'
            availability = 'N/A'
            
            # For IMDB structure (ipc-metadata-list-summary-item)
            if 'ipc-metadata-list-summary-item' in movie.get('class', []):
                title_element = movie.find('h3', class_='ipc-title__text')
                if title_element:
                    title = title_element.get_text(strip=True)
                    title = re.sub(r'^\d+\.\s*', '', title)
                
                year_elements = movie.find_all('span', class_='cli-title-metadata-item')
                for elem in year_elements:
                    year_text = elem.get_text(strip=True)
                    if year_text.isdigit() and len(year_text) == 4:
                        release_date = year_text
                        break
                
                rating_element = movie.find('span', class_='ipc-rating-star--rating')
                if rating_element:
                    availability = f"Rating: {rating_element.get_text(strip=True)}"
            
            # For older IMDB structure (titleColumn)
            elif 'titleColumn' in movie.get('class', []):
                title_element = movie.find('a')
                if title_element:
                    title = title_element.get_text(strip=True)
                
                year_element = movie.find('span', class_='secondaryInfo')
                if year_element:
                    year_text = year_element.get_text(strip=True)
                    release_date = re.sub(r'[()\s]', '', year_text)
                
                rating_cell = movie.find_next_sibling('td', class_='ratingColumn')
                if rating_cell:
                    rating_element = rating_cell.find('strong')
                    if rating_element:
                        availability = f"Rating: {rating_element.get_text(strip=True)}"
            
            # For generic streaming sites
            else:
                # Try multiple title selectors for streaming sites
                title_element = (movie.find('h1') or movie.find('h2') or movie.find('h3') or 
                               movie.find('h4') or movie.find('h5') or movie.find('h6') or
                               movie.find('a', class_=re.compile(r'title|name')) or
                               movie.find('div', class_=re.compile(r'title|name')) or
                               movie.find('span', class_=re.compile(r'title|name')) or
                               movie.find('div', class_='film-name') or
                               movie.find('h3', class_='film-name') or
                               movie.find('a', title=True) or
                               movie.find('img', alt=True) or
                               movie.find('a'))
                
                if title_element:
                    # Get title from text, title attribute, or alt attribute
                    if title_element.name == 'img' and title_element.get('alt'):
                        title = title_element.get('alt')
                    elif title_element.get('title'):
                        title = title_element.get('title')
                    else:
                        title = title_element.get_text(strip=True)
                    
                    # Clean up title
                    title = re.sub(r'^\d+\.\s*', '', title)
                    title = re.sub(r'\s+', ' ', title)
                    # Remove common streaming site suffixes
                    title = re.sub(r'\s*(HD|CAM|TS|DVDRip|BluRay)\s*$', '', title, flags=re.IGNORECASE)
                
                # Try to find any date/year - be more aggressive in searching
                # First try specific elements that might contain dates
                year_element = (movie.find('span') or movie.find('div') or movie.find('time') or 
                              movie.find('p') or movie.find('small') or movie.find('em'))
                
                # Search through all text content for any 4-digit year
                all_text = movie.get_text() if movie else ''
                year_match = re.search(r'\b(19|20)\d{2}\b', all_text)
                if year_match:
                    release_date = year_match.group()
                else:
                    # If no 4-digit year found, try to find any date-like patterns
                    # Look for patterns like MM/DD/YYYY, DD-MM-YYYY, etc.
                    date_patterns = [
                        r'\b\d{1,2}[/-]\d{1,2}[/-](19|20)\d{2}\b',  # MM/DD/YYYY or DD-MM-YYYY
                        r'\b(19|20)\d{2}[/-]\d{1,2}[/-]\d{1,2}\b',  # YYYY/MM/DD or YYYY-MM-DD
                        r'\b\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(19|20)\d{2}\b',  # DD Mon YYYY
                        r'\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+(19|20)\d{2}\b'  # Mon DD, YYYY
                    ]
                    
                    for pattern in date_patterns:
                        date_match = re.search(pattern, all_text, re.IGNORECASE)
                        if date_match:
                            # Extract just the year from the matched date
                            year_in_date = re.search(r'(19|20)\d{2}', date_match.group())
                            if year_in_date:
                                release_date = year_in_date.group()
                                break
                
                # Try to find rating with more selectors
                rating_element = (movie.find('span', class_=re.compile(r'rating|score|imdb|vote')) or
                                movie.find('div', class_=re.compile(r'rating|score|imdb|vote')) or
                                movie.find('span', class_='fdi-item'))
                
                if rating_element:
                    rating_text = rating_element.get_text(strip=True)
                    # Check if it looks like a rating (number with optional decimal)
                    if rating_text and rating_text != 'N/A' and re.match(r'^\d+(\.\d+)?(/\d+)?$', rating_text.strip()):
                        availability = f"Rating: {rating_text}"
            
            # Store movie data for potential AI processing later
            movie_data = {
                'title': title,
                'release_date': release_date,
                'availability': availability,
                'needs_ai': release_date == 'N/A' and title != 'N/A'
            }
            
            # Skip if no valid title found
            if movie_data['title'] == 'N/A' or not movie_data['title'].strip() or len(movie_data['title'].strip()) < 2:
                continue
            
            # Create movie document
            movie_doc = {
                'title': movie_data['title'],
                'price': movie_data['release_date'],
                'availability': movie_data['availability'],
                'category': category or 'General',
                'source': url,
                'contentType': 'movies',
                'timestamp': datetime.now().isoformat(),
                'needs_ai': movie_data['needs_ai']
            }
            
            scraped_movies.append(movie_doc)
            
            # Update progress after each movie
            update_progress(processed=index + 1, message=f'Processed {index + 1}/{total_movies} movies')
            
        except Exception as e:
            print(f"Error scraping movie: {e}")
            continue
    
    # Batch AI processing for movies missing release dates
    movies_needing_ai = [movie for movie in scraped_movies if movie.get('needs_ai', False)]
    if movies_needing_ai:
        ai_total = len(movies_needing_ai)
        update_progress(ai_total=ai_total, ai_processed=0, status='ai_processing', 
                       message=f'Processing {ai_total} movies with AI for missing release dates...')
        
        for ai_index, movie in enumerate(movies_needing_ai):
            try:
                ai_result = extract_info_with_ai(movie['title'], "movie")
                if ai_result:
                    if ai_result.get('release_date') and ai_result.get('release_date') != 'N/A':
                        movie['price'] = ai_result['release_date']
                    if ai_result.get('rating') and ai_result.get('rating') != 'N/A' and movie['availability'] == 'N/A':
                        movie['availability'] = f"Rating: {ai_result['rating']}"
            except Exception as e:
                print(f"AI extraction failed for movie '{movie['title']}': {e}")
            
            # Update AI progress
            update_progress(ai_processed=ai_index + 1, 
                           message=f'AI processed {ai_index + 1}/{ai_total} movies')
            
            # Remove the needs_ai flag
            movie.pop('needs_ai', None)
    
    return scraped_movies

def scrape_tvshows_data(soup, url, category):
    scraped_tvshows = []
    
    # Try different selectors for various TV show sites
    # IMDB selectors
    tvshows = (soup.find_all('li', class_='ipc-metadata-list-summary-item') or 
               soup.find_all('td', class_='titleColumn') or 
               soup.find_all('li', class_='cli-item') or
               soup.find_all('div', class_='lister-item'))
    
    # If no IMDB-style elements found, try generic streaming site selectors
    if not tvshows:
        # Try broader selectors for streaming sites like hdtoday.to
        tvshows = (soup.find_all('div', class_='film-poster') or
                   soup.find_all('div', class_='tv-item') or
                   soup.find_all('div', class_='show-item') or
                   soup.find_all('div', class_='series-item') or
                   soup.find_all('div', class_='item') or
                   soup.find_all('article', class_='tv') or
                   soup.find_all('article', class_='show') or
                   soup.find_all('div', class_='card') or
                   soup.find_all('div', class_='flw-item') or
                   soup.find_all('div', class_='film_list-wrap') or
                   soup.find_all('a', class_='flw-item-img') or
                   soup.find_all('a', href=re.compile(r'/tv/|/show/|/series/|/watch/')) or
                   soup.select('div[class*="tv"]') or
                   soup.select('div[class*="show"]') or
                   soup.select('div[class*="series"]') or
                   soup.select('a[href*="/tv/"]') or
                   soup.select('a[href*="/show/"]') or
                   soup.select('a[href*="/series/"]'))
    
    # Initialize progress tracking for TV shows
    total_shows = len(tvshows)
    update_progress(total=total_shows, processed=0, status='scraping', message=f'Found {total_shows} TV shows to process')
    
    for index, show in enumerate(tvshows):
        try:
            title = 'N/A'
            release_date = 'N/A'
            availability = 'N/A'
            
            # For IMDB structure (ipc-metadata-list-summary-item)
            if 'ipc-metadata-list-summary-item' in show.get('class', []):
                title_element = show.find('h3', class_='ipc-title__text')
                if title_element:
                    title = title_element.get_text(strip=True)
                    title = re.sub(r'^\d+\.\s*', '', title)
                
                year_elements = show.find_all('span', class_='cli-title-metadata-item')
                for elem in year_elements:
                    year_text = elem.get_text(strip=True)
                    if year_text.isdigit() and len(year_text) == 4:
                        release_date = year_text
                        break
                
                rating_element = show.find('span', class_='ipc-rating-star--rating')
                if rating_element:
                    availability = f"Rating: {rating_element.get_text(strip=True)}"
            
            # For older IMDB structure (titleColumn)
            elif 'titleColumn' in show.get('class', []):
                title_element = show.find('a')
                if title_element:
                    title = title_element.get_text(strip=True)
                
                year_element = show.find('span', class_='secondaryInfo')
                if year_element:
                    year_text = year_element.get_text(strip=True)
                    release_date = re.sub(r'[()\s]', '', year_text)
                
                rating_cell = show.find_next_sibling('td', class_='ratingColumn')
                if rating_cell:
                    rating_element = rating_cell.find('strong')
                    if rating_element:
                        availability = f"Rating: {rating_element.get_text(strip=True)}"
            
            # For generic streaming sites
            else:
                # Try multiple title selectors for streaming sites
                title_element = (show.find('h1') or show.find('h2') or show.find('h3') or 
                               show.find('h4') or show.find('h5') or show.find('h6') or
                               show.find('a', class_=re.compile(r'title|name')) or
                               show.find('div', class_=re.compile(r'title|name')) or
                               show.find('span', class_=re.compile(r'title|name')) or
                               show.find('div', class_='film-name') or
                               show.find('h3', class_='film-name') or
                               show.find('a', title=True) or
                               show.find('img', alt=True) or
                               show.find('a'))
                
                if title_element:
                    # Get title from text, title attribute, or alt attribute
                    if title_element.name == 'img' and title_element.get('alt'):
                        title = title_element.get('alt')
                    elif title_element.get('title'):
                        title = title_element.get('title')
                    else:
                        title = title_element.get_text(strip=True)
                    
                    # Clean up title
                    title = re.sub(r'^\d+\.\s*', '', title)
                    title = re.sub(r'\s+', ' ', title)
                    # Remove common streaming site suffixes
                    title = re.sub(r'\s*(HD|CAM|TS|DVDRip|BluRay)\s*$', '', title, flags=re.IGNORECASE)
                
                # Try to find any date/year - be more aggressive in searching for TV shows
                # Search through all text content for date ranges first (TV shows priority)
                all_text = show.get_text() if show else ''
                
                # First try to find date ranges like "2014-2017" or "2014 - 2017"
                date_range_match = re.search(r'\b(19|20)\d{2}\s*[-–—]\s*(19|20)\d{2}\b', all_text)
                if date_range_match:
                    release_date = date_range_match.group().replace(' ', '')
                else:
                    # If no date range, look for single 4-digit year
                    year_match = re.search(r'\b(19|20)\d{2}\b', all_text)
                    if year_match:
                        release_date = year_match.group()
                    else:
                        # If no 4-digit year found, try to find any date-like patterns
                        # Look for patterns like MM/DD/YYYY, DD-MM-YYYY, etc.
                        date_patterns = [
                            r'\b\d{1,2}[/-]\d{1,2}[/-](19|20)\d{2}\b',  # MM/DD/YYYY or DD-MM-YYYY
                            r'\b(19|20)\d{2}[/-]\d{1,2}[/-]\d{1,2}\b',  # YYYY/MM/DD or YYYY-MM-DD
                            r'\b\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(19|20)\d{2}\b',  # DD Mon YYYY
                            r'\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+(19|20)\d{2}\b'  # Mon DD, YYYY
                        ]
                        
                        for pattern in date_patterns:
                            date_match = re.search(pattern, all_text, re.IGNORECASE)
                            if date_match:
                                # Extract just the year from the matched date
                                year_in_date = re.search(r'(19|20)\d{2}', date_match.group())
                                if year_in_date:
                                    release_date = year_in_date.group()
                                    break
                
                # Try to find rating with more selectors
                rating_element = (show.find('span', class_=re.compile(r'rating|score|imdb|vote')) or
                                show.find('div', class_=re.compile(r'rating|score|imdb|vote')) or
                                show.find('span', class_='fdi-item'))
                
                if rating_element:
                    rating_text = rating_element.get_text(strip=True)
                    # Check if it looks like a rating (number with optional decimal)
                    if rating_text and rating_text != 'N/A' and re.match(r'^\d+(\.\d+)?(/\d+)?$', rating_text.strip()):
                        availability = f"Rating: {rating_text}"
            
            # Store TV show data for potential AI processing later
            show_data = {
                'title': title,
                'release_date': release_date,
                'availability': availability,
                'needs_ai': release_date == 'N/A' and title != 'N/A'
            }
            
            # Skip if no valid title found
            if show_data['title'] == 'N/A' or not show_data['title'].strip() or len(show_data['title'].strip()) < 2:
                continue
            
            # Create TV show document
            tvshow_doc = {
                'title': show_data['title'],
                'price': show_data['release_date'],
                'availability': show_data['availability'],
                'category': category or 'General',
                'source': url,
                'contentType': 'tvshows',
                'timestamp': datetime.now().isoformat(),
                'needs_ai': show_data['needs_ai']
            }
            
            scraped_tvshows.append(tvshow_doc)
            
            # Update progress after each TV show
            update_progress(processed=index + 1, message=f'Processed {index + 1}/{total_shows} TV shows')
            
        except Exception as e:
            print(f"Error scraping TV show: {e}")
            continue
    
    # Batch AI processing for TV shows missing release dates
    shows_needing_ai = [show for show in scraped_tvshows if show.get('needs_ai', False)]
    if shows_needing_ai:
        ai_total = len(shows_needing_ai)
        update_progress(ai_total=ai_total, ai_processed=0, status='ai_processing', 
                       message=f'Processing {ai_total} TV shows with AI for missing release dates...')
        
        for ai_index, show in enumerate(shows_needing_ai):
            try:
                ai_result = extract_info_with_ai(show['title'], "TV show")
                if ai_result:
                    if ai_result.get('release_date') and ai_result.get('release_date') != 'N/A':
                        show['price'] = ai_result['release_date']
                    if ai_result.get('rating') and ai_result.get('rating') != 'N/A' and show['availability'] == 'N/A':
                        show['availability'] = f"Rating: {ai_result['rating']}"
            except Exception as e:
                print(f"AI extraction failed for TV show '{show['title']}': {e}")
            
            # Update AI progress
            update_progress(ai_processed=ai_index + 1, 
                           message=f'AI processed {ai_index + 1}/{ai_total} TV shows')
            
            # Remove the needs_ai flag
            show.pop('needs_ai', None)
    
    return scraped_tvshows

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

@app.route('/delete', methods=['POST'])
def delete_items():
    try:
        data = request.get_json()
        items_to_delete = data.get('items', [])
        
        if not items_to_delete:
            return jsonify({'error': 'No items specified for deletion'}), 400
        
        deleted_count = 0
        
        # Delete each item based on its unique properties
        for item in items_to_delete:
            # Use title, source, and timestamp as unique identifiers
            query = {
                'title': item.get('title'),
                'source': item.get('source'),
                'timestamp': item.get('timestamp')
            }
            
            result = collection.delete_one(query)
            if result.deleted_count > 0:
                deleted_count += 1
        
        return jsonify({
            'success': True,
            'message': f'Successfully deleted {deleted_count} items',
            'deleted_count': deleted_count
        })
        
    except Exception as e:
        return jsonify({'error': f'An error occurred: {str(e)}'}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)