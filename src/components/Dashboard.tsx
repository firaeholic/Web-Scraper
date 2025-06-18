import { useState, useEffect } from 'react';
import axios from 'axios';

interface ScrapedItem {
  title: string;
  price: string;
  availability: string;
  category: string;
  source: string;
  timestamp: string;
}

interface SiteSummary {
  [key: string]: number;
}

const Dashboard = () => {
  const [data, setData] = useState<ScrapedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [siteSummary, setSiteSummary] = useState<SiteSummary>({});

  useEffect(() => {
    fetchData();
  }, []);

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
      const domain = new URL(item.source).hostname;
      summary[domain] = (summary[domain] || 0) + 1;
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

  const downloadCSV = () => {
    const headers = ['Title', 'Price', 'Availability', 'Category', 'Source', 'Timestamp'];
    const csvContent = [
      headers.join(','),
      ...data.map(item => [
        `"${item.title.replace(/"/g, '""')}"`,
        `"${item.price}"`,
        `"${item.availability}"`,
        `"${item.category}"`,
        `"${item.source}"`,
        `"${new Date(item.timestamp).toLocaleString()}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scraped-data-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const downloadJSON = () => {
    const jsonContent = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scraped-data-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
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
            <p className="text-2xl font-bold text-blue-600">{data.length}</p>
          </div>
          <div className="bg-green-50 p-4 rounded-lg">
            <h3 className="font-semibold text-green-800">Sites Scraped</h3>
            <p className="text-2xl font-bold text-green-600">{Object.keys(siteSummary).length}</p>
          </div>
          <div className="bg-purple-50 p-4 rounded-lg">
            <h3 className="font-semibold text-purple-800">Categories</h3>
            <p className="text-2xl font-bold text-purple-600">
              {new Set(data.map(item => item.category)).size}
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

        {/* Export Buttons */}
        {data.length > 0 && (
          <div className="flex space-x-4">
            <button
              onClick={downloadCSV}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
            >
              Download CSV
            </button>
            <button
              onClick={downloadJSON}
              className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors"
            >
              Download JSON
            </button>
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
                    Title
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Price
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Availability
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
                {data.map((item, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                      {item.title}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      £{item.price}
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
                        {new URL(item.source).hostname}
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