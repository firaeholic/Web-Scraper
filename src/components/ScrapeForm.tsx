import React, { useState } from 'react';
import axios from 'axios';

const ScrapeForm = () => {
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState('');
  const [contentType, setContentType] = useState('books');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');
  const [progress, setProgress] = useState({
    total_items: 0,
    processed_items: 0,
    ai_total: 0,
    ai_processed: 0,
    scraping_percentage: 0,
    ai_percentage: 0,
    status: 'idle',
    message: ''
  });
  const [eventSource, setEventSource] = useState<EventSource | null>(null);

  const contentTypes = [
    { value: 'books', label: 'Books' },
    { value: 'movies', label: 'Movies' },
    { value: 'tvshows', label: 'TV Shows' }
  ];

  const getCategories = () => {
    switch (contentType) {
      case 'books':
        return [
          'Fiction',
          'Non-Fiction',
          'Mystery',
          'Romance',
          'Science Fiction',
          'Fantasy',
          'Biography',
          'History',
          'Self-Help',
          'Children',
          'General'
        ];
      case 'movies':
        return [
          'Action',
          'Comedy',
          'Drama',
          'Horror',
          'Romance',
          'Sci-Fi',
          'Thriller',
          'Documentary',
          'Animation',
          'Adventure',
          'General'
        ];
      case 'tvshows':
        return [
          'Drama',
          'Comedy',
          'Reality',
          'Documentary',
          'News',
          'Talk Show',
          'Game Show',
          'Soap Opera',
          'Mini-Series',
          'Animation',
          'General'
        ];
      default:
        return ['General'];
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!url.trim()) {
      setMessage('Please enter a URL');
      setMessageType('error');
      return;
    }

    setLoading(true);
    setMessage('');
    setProgress({
      total_items: 0,
      processed_items: 0,
      ai_total: 0,
      ai_processed: 0,
      scraping_percentage: 0,
      ai_percentage: 0,
      status: 'starting',
      message: 'Starting scraping process...'
    });

    // Set up EventSource for progress updates
    const es = new EventSource('http://localhost:5000/progress');
    setEventSource(es);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setProgress(data);
        
        if (data.status === 'completed') {
          const itemType = contentType === 'tvshows' ? 'TV shows' : contentType;
          setMessage(`Successfully scraped ${data.processed_items} ${itemType}!`);
          setMessageType('success');
          setUrl('');
          setCategory('');
          setLoading(false);
          es.close();
          setEventSource(null);
        } else if (data.status === 'error') {
          setMessage(data.message || 'An error occurred while scraping');
          setMessageType('error');
          setLoading(false);
          es.close();
          setEventSource(null);
        }
      } catch (error) {
        console.error('Error parsing progress data:', error);
      }
    };

    es.onerror = () => {
      setMessage('Connection error occurred');
      setMessageType('error');
      setLoading(false);
      es.close();
      setEventSource(null);
    };

    try {
      await axios.post('http://localhost:5000/scrape', {
        url: url.trim(),
        category: category || 'General',
        contentType: contentType
      });
    } catch (error: unknown) {
      const apiError = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
      const errorMessage = apiError || 'An error occurred while scraping';
      setMessage(errorMessage);
      setMessageType('error');
      setLoading(false);
      if (eventSource) {
        eventSource.close();
        setEventSource(null);
      }
    }
  };

  // Cleanup EventSource on component unmount
  React.useEffect(() => {
    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [eventSource]);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-3xl font-bold text-gray-800 mb-6 text-center">Web Scraper</h2>
        <p className="text-gray-600 mb-6 text-center">
          Enter a URL to scrape books, movies, or TV shows data
        </p>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="contentType" className="block text-sm font-medium text-gray-700 mb-2">
              Content Type
            </label>
            <select
              id="contentType"
              value={contentType}
              onChange={(e) => {
                setContentType(e.target.value);
                setCategory(''); // Reset category when content type changes
              }}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
            >
              {contentTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="url" className="block text-sm font-medium text-gray-700 mb-2">
              URL to Scrape
            </label>
            <input
              type="url"
              id="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={contentType === 'books' ? 'https://books.toscrape.com/catalogue/page-1.html' : 
                          contentType === 'movies' ? 'https://www.imdb.com/chart/top/' : 
                          'https://www.imdb.com/chart/toptv/'}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              required
            />
          </div>

          <div>
            <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-2">
              Category (Optional)
            </label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
            >
              <option value="">Select a category...</option>
              {getCategories().map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                Scraping...
              </div>
            ) : (
              'Scrape'
            )}
          </button>
        </form>

        {/* Progress Display */}
        {loading && progress.status !== 'idle' && (
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="font-semibold text-blue-800 mb-3">Scraping Progress</h3>
            
            {/* Scraping Progress */}
            {progress.total_items > 0 && (
              <div className="mb-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-blue-700">Items Scraped</span>
                  <span className="text-sm text-blue-600">
                    {progress.processed_items}/{progress.total_items} ({progress.scraping_percentage.toFixed(1)}%)
                  </span>
                </div>
                <div className="w-full bg-blue-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${progress.scraping_percentage}%` }}
                  ></div>
                </div>
              </div>
            )}
            
            {/* AI Processing Progress */}
            {progress.ai_total > 0 && (
              <div className="mb-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-purple-700">AI Data Polishing</span>
                  <span className="text-sm text-purple-600">
                    {progress.ai_processed}/{progress.ai_total} ({progress.ai_percentage.toFixed(1)}%)
                  </span>
                </div>
                <div className="w-full bg-purple-200 rounded-full h-2">
                  <div 
                    className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${progress.ai_percentage}%` }}
                  ></div>
                </div>
              </div>
            )}
            
            {/* Status Message */}
            <div className="text-sm text-gray-600">
              <span className="font-medium">Status:</span> {progress.message}
            </div>
          </div>
        )}

        {message && (
          <div className={`mt-6 p-4 rounded-lg ${
            messageType === 'success' 
              ? 'bg-green-100 border border-green-400 text-green-700' 
              : 'bg-red-100 border border-red-400 text-red-700'
          }`}>
            {message}
          </div>
        )}

        <div className="mt-8 p-4 bg-blue-50 rounded-lg">
          <h3 className="font-semibold text-blue-800 mb-2">Example URLs:</h3>
          {contentType === 'books' && (
            <ul className="text-sm text-blue-600 space-y-1">
              <li>• https://books.toscrape.com/catalogue/page-1.html</li>
              <li>• https://books.toscrape.com/catalogue/page-2.html</li>
              <li>• https://books.toscrape.com/</li>
            </ul>
          )}
          {contentType === 'movies' && (
            <ul className="text-sm text-blue-600 space-y-1">
              <li>• https://www.imdb.com/chart/top/</li>
              <li>• https://www.imdb.com/chart/moviemeter/</li>
              <li>• https://www.imdb.com/search/title/?title_type=feature</li>
            </ul>
          )}
          {contentType === 'tvshows' && (
            <ul className="text-sm text-blue-600 space-y-1">
              <li>• https://www.imdb.com/chart/toptv/</li>
              <li>• https://www.imdb.com/chart/tvmeter/</li>
              <li>• https://www.imdb.com/search/title/?title_type=tv_series</li>
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default ScrapeForm;