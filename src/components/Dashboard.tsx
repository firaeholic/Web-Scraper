import { useState, useEffect } from 'react';
import axios from 'axios';

interface ScrapedItem {
  _id?: string;
  title: string;
  price: string;
  availability: string;
  category: string;
  source: string;
  timestamp: string;
  contentType?: string;
}

interface SiteSummary {
  [key: string]: number;
}

const Dashboard = () => {
  const [data, setData] = useState<ScrapedItem[]>([]);
  const [filteredData, setFilteredData] = useState<ScrapedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [siteSummary, setSiteSummary] = useState<SiteSummary>({});
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [contentTypeFilter, setContentTypeFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    filterData();
  }, [data, contentTypeFilter, searchQuery]);

  const filterData = () => {
    let filtered = data;
    
    // Filter by content type
    if (contentTypeFilter !== 'all') {
      filtered = filtered.filter(item => item.contentType === contentTypeFilter);
    }
    
    // Filter by search query (search in title)
    if (searchQuery.trim()) {
      filtered = filtered.filter(item => 
        item.title.toLowerCase().includes(searchQuery.toLowerCase().trim())
      );
    }
    
    setFilteredData(filtered);
    setSelectedItems(new Set()); // Clear selection when filter changes
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await axios.get('http://localhost:5000/data');
      
      if (response.data.success) {
        setData(response.data.data);
        calculateSiteSummary(response.data.data);
      } else {
        setError('Failed to fetch data');
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      const apiError = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError('Error fetching data: ' + (apiError || errorMessage));
    } finally {
      setLoading(false);
    }
  };

  const calculateSiteSummary = (items: ScrapedItem[]) => {
    const summary: SiteSummary = {};
    items.forEach(item => {
      try {
        const domain = new URL(item.source).hostname;
        summary[domain] = (summary[domain] || 0) + 1;
      } catch (error) {
        console.error('Error parsing URL:', error);
        // If URL is invalid, use the source as-is or a fallback
        const fallbackDomain = item.source || 'Unknown Source';
        summary[fallbackDomain] = (summary[fallbackDomain] || 0) + 1;
      }
    });
    setSiteSummary(summary);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // You could add a toast notification here
  };

  const copyRow = (item: ScrapedItem) => {
    const rowText = `${item.title}\t${item.price}\t${item.availability}\t${item.category}\t${item.source}\t${new Date(item.timestamp).toLocaleString()}`;
    copyToClipboard(rowText);
  };

  const exportToCSV = () => {
    const headers = ['Title', 'Price/Release Date', 'Availability/Rating', 'Category', 'Source', 'Timestamp', 'Content Type'];
    const csvContent = [
      headers.join(','),
      ...filteredData.map(item => [
        `"${item.title.replace(/"/g, '""')}"`,
        `"${item.price}"`,
        `"${item.availability}"`,
        `"${item.category}"`,
        `"${item.source}"`,
        `"${new Date(item.timestamp).toLocaleString()}"`,
        `"${item.contentType || 'books'}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const filterSuffix = contentTypeFilter !== 'all' ? `_${contentTypeFilter}` : '';
    a.download = `scraped-data-${new Date().toISOString().split('T')[0]}${filterSuffix}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const exportToJSON = () => {
    const jsonContent = JSON.stringify(filteredData, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const filterSuffix = contentTypeFilter !== 'all' ? `_${contentTypeFilter}` : '';
    a.download = `scraped-data-${new Date().toISOString().split('T')[0]}${filterSuffix}.json`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const handleSelectItem = (index: number) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedItems(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedItems.size === filteredData.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(filteredData.map((_, index) => index)));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedItems.size === 0) return;
    
    try {
      setIsDeleting(true);
      const indicesToDelete = Array.from(selectedItems);
      const itemsToDelete = indicesToDelete.map(index => filteredData[index]);
      
      // Send delete request to backend
      const response = await axios.post('http://localhost:5000/delete', {
        items: itemsToDelete
      });
      
      if (response.data.success) {
        // Remove deleted items from local state
        const deletedItemsSet = new Set(itemsToDelete.map(item => 
          `${item.title}-${item.source}-${item.timestamp}`
        ));
        const newData = data.filter(item => 
          !deletedItemsSet.has(`${item.title}-${item.source}-${item.timestamp}`)
        );
        setData(newData);
        calculateSiteSummary(newData);
        setSelectedItems(new Set());
      } else {
        setError('Failed to delete items');
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      setError('Error deleting items: ' + errorMessage);
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-3xl font-bold text-gray-800">Scraped Data Dashboard</h2>
          <button
            onClick={fetchData}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Refresh
          </button>
        </div>
        
        {/* Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          <div className="bg-blue-50 p-4 rounded-lg">
            <h3 className="font-semibold text-blue-800">Total Items</h3>
            <p className="text-2xl font-bold text-blue-600">{filteredData.length}</p>
            {contentTypeFilter !== 'all' && (
              <p className="text-sm text-gray-500">({data.length} total)</p>
            )}
          </div>
          <div className="bg-green-50 p-4 rounded-lg">
            <h3 className="font-semibold text-green-800">Sites Scraped</h3>
            <p className="text-2xl font-bold text-green-600">{Object.keys(siteSummary).length}</p>
          </div>
          <div className="bg-purple-50 p-4 rounded-lg">
            <h3 className="font-semibold text-purple-800">Categories</h3>
            <p className="text-2xl font-bold text-purple-600">
              {new Set(filteredData.map(item => item.category)).size}
            </p>
          </div>
        </div>

        {/* Site Summary */}
        {Object.keys(siteSummary).length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3">Items per Site:</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {Object.entries(siteSummary).map(([site, count]) => (
                <div key={site} className="bg-gray-50 p-3 rounded flex justify-between">
                  <span className="text-sm text-gray-600">{site}</span>
                  <span className="font-semibold">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filters Section */}
        <div className="mb-6 space-y-4">
          {/* Content Type Filter */}
          <div className="bg-white p-4 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Filter by Content Type</h3>
            <div className="flex flex-wrap gap-2">
              {['all', 'books', 'movies', 'tvshows'].map((type) => (
                <button
                  key={type}
                  onClick={() => setContentTypeFilter(type)}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    contentTypeFilter === type
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {type === 'all' ? 'All' : type === 'tvshows' ? 'TV Shows' : type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ))}
            </div>
          </div>
          
          {/* Search Filter */}
          <div className="bg-white p-4 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Search by Title</h3>
            <div className="relative">
              <input
                type="text"
                placeholder="Search items by title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              />
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                >
                  <svg className="h-5 w-5 text-gray-400 hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            {searchQuery && (
              <p className="mt-2 text-sm text-gray-600">
                Showing {filteredData.length} result(s) for "{searchQuery}"
              </p>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        {data.length > 0 && (
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex space-x-4">
              <button
                onClick={exportToCSV}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
              >
                Export CSV
              </button>
              <button
                onClick={exportToJSON}
                className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors"
              >
                Export JSON
              </button>
            </div>
            
            {selectedItems.size > 0 && (
              <div className="flex items-center space-x-4">
                <span className="text-sm text-gray-600">
                  {selectedItems.size} item{selectedItems.size !== 1 ? 's' : ''} selected
                </span>
                <button
                  onClick={handleDeleteSelected}
                  disabled={isDeleting}
                  className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDeleting ? 'Deleting...' : 'Delete Selected'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Data Table */}
      {data.length > 0 ? (
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <input
                      type="checkbox"
                      checked={filteredData.length > 0 && selectedItems.size === filteredData.length}
                      onChange={handleSelectAll}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Title
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {contentTypeFilter === 'books' ? 'Price' : 
                     contentTypeFilter === 'movies' || contentTypeFilter === 'tvshows' ? 'Release Date' : 
                     'Price/Release Date'}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {contentTypeFilter === 'books' ? 'Availability' : 
                     contentTypeFilter === 'movies' || contentTypeFilter === 'tvshows' ? 'Rating' : 
                     'Availability/Rating'}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Source
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Timestamp
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredData.map((item, index) => (
                  <tr key={index} className={`hover:bg-gray-50 ${selectedItems.has(index) ? 'bg-blue-50' : ''}`}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedItems.has(index)}
                        onChange={() => handleSelectItem(index)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                      {item.title}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.price}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.availability}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                        {item.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                      <a 
                        href={item.source} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800"
                      >
                        {(() => {
                          try {
                            return new URL(item.source).hostname;
                          } catch (error) {
                            console.error('Error parsing URL:', error);
                            return item.source || 'Invalid URL';
                          }
                        })()}
                      </a>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(item.timestamp)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => copyRow(item)}
                        className="text-blue-600 hover:text-blue-900 text-xs bg-blue-100 px-2 py-1 rounded"
                      >
                        Copy
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-md p-8 text-center">
          <p className="text-gray-500 text-lg">No data available. Start by scraping some URLs!</p>
        </div>
      )}
    </div>
  );
};

export default Dashboard;