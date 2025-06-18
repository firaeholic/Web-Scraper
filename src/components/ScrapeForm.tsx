import { useState } from 'react';
import axios from 'axios';

const ScrapeForm = () => {
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState('');
  const [contentType, setContentType] = useState('books');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');

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

    try {
      const response = await axios.post('http://localhost:5000/scrape', {
        url: url.trim(),
        category: category || 'General',
        contentType: contentType
      });

      if (response.data.success) {
        const itemType = contentType === 'tvshows' ? 'TV shows' : contentType;
        setMessage(`Successfully scraped ${response.data.count} ${itemType}!`);
        setMessageType('success');
        setUrl('');
        setCategory('');
      } else {
        setMessage('Failed to scrape data');
        setMessageType('error');
      }
    } catch (error: unknown) {
      const apiError = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
      const errorMessage = apiError || 'An error occurred while scraping';
      setMessage(errorMessage);
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

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