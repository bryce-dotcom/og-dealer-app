import { useTheme } from '../components/Layout';

// Inside the component:
const themeContext = useTheme();
const theme = themeContext?.theme || {
  bg: '#09090b', bgCard: '#18181b', border: '#27272a',
  text: '#ffffff', textSecondary: '#a1a1aa', textMuted: '#71717a',
  accent: '#f97316', accentBg: 'rgba(249,115,22,0.15)'
};

// Then use theme.bg, theme.bgCard, theme.text, etc instead of hardcoded colors
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useStore } from '../lib/store'
import { ArrowLeft, Car, Edit, Trash2, MoreVertical, Navigation } from 'lucide-react'
import { useState } from 'react'

const statusColors = {
  'In Stock': 'badge-blue',
  'Sold': 'badge-green',
  'BHPH': 'badge-yellow',
  'Pending': 'badge-yellow',
  'Wholesale': 'badge-red'
}

export default function VehicleDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const inventory = useStore((state) => state.inventory)
  const [showMenu, setShowMenu] = useState(false)
  
  const vehicle = inventory.find(v => v.id === id)
  
  if (!vehicle) {
    return (
      <div className="p-4 text-center">
        <p className="text-dark-400">Vehicle not found</p>
        <Link to="/inventory" className="text-primary-400 mt-2 inline-block">Back to Inventory</Link>
      </div>
    )
  }
  
  const formatCurrency = (amount) => {
    if (!amount) return '-'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount)
  }
  
  const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  }
  
  const title = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(' ')
  const profit = vehicle.status === 'Sold' && vehicle.sale_price && vehicle.purchase_price
    ? vehicle.sale_price - vehicle.purchase_price - (vehicle.total_expenses || 0)
    : null
  
  return (
    <div className="pb-24">
      <div className="sticky top-14 z-30 bg-dark-900 border-b border-dark-800 px-4 py-3">
        <div className="flex items-center justify-between">
          <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-dark-400">
            <ArrowLeft size={20} />
            <span>Back</span>
          </button>
          
          <div className="relative">
            <button onClick={() => setShowMenu(!showMenu)} className="p-2 rounded-lg hover:bg-dark-800">
              <MoreVertical size={20} />
            </button>
            
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 bg-dark-800 rounded-lg border border-dark-700 py-1 min-w-32 shadow-xl">
                <button className="w-full px-4 py-2 text-left hover:bg-dark-700 flex items-center gap-2">
                  <Edit size={16} /> Edit
                </button>
                {vehicle.status === 'BHPH' && (
                  <button className="w-full px-4 py-2 text-left hover:bg-dark-700 flex items-center gap-2 text-blue-400">
                    <Navigation size={16} /> Track GPS
                  </button>
                )}
                <button className="w-full px-4 py-2 text-left hover:bg-dark-700 flex items-center gap-2 text-red-400">
                  <Trash2 size={16} /> Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      
      <div className="h-48 bg-dark-800 flex items-center justify-center">
        {vehicle.primary_photo ? (
          <img src={vehicle.primary_photo} alt={title} className="w-full h-full object-cover" />
        ) : (
          <Car className="text-dark-600" size={64} />
        )}
      </div>
      
      <div className="p-4">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl font-bold mb-1">{title || 'Unknown Vehicle'}</h1>
            <p className="text-dark-400">#{vehicle.unit_id}</p>
          </div>
          <span className={`badge ${statusColors[vehicle.status] || 'badge-blue'}`}>{vehicle.status}</span>
        </div>
        
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="card text-center py-3">
            <p className="text-dark-400 text-xs mb-1">Cost</p>
            <p className="font-bold">{formatCurrency(vehicle.purchase_price)}</p>
          </div>
          <div className="card text-center py-3">
            <p className="text-dark-400 text-xs mb-1">Expenses</p>
            <p className="font-bold">{formatCurrency(vehicle.total_expenses || 0)}</p>
          </div>
          <div className="card text-center py-3">
            <p className="text-dark-400 text-xs mb-1">{vehicle.status === 'Sold' ? 'Sold For' : 'List Price'}</p>
            <p className="font-bold text-primary-400">{formatCurrency(vehicle.sale_price || vehicle.purchase_price)}</p>
          </div>
        </div>
        
        <div className="card mb-4">
          <h2 className="font-semibold mb-3">Vehicle Info</h2>
          <div className="space-y-3">
            <div className="flex justify-between"><span className="text-dark-400">Unit ID</span><span className="font-medium">{vehicle.unit_id}</span></div>
            <div className="flex justify-between"><span className="text-dark-400">VIN</span><span className="font-medium">{vehicle.vin || '-'}</span></div>
            <div className="flex justify-between"><span className="text-dark-400">Miles</span><span className="font-medium">{vehicle.miles?.toLocaleString() || '-'}</span></div>
            <div className="flex justify-between"><span className="text-dark-400">Color</span><span className="font-medium">{vehicle.color || '-'}</span></div>
            <div className="flex justify-between"><span className="text-dark-400">Acquired</span><span className="font-medium">{formatDate(vehicle.date_acquired)}</span></div>
            <div className="flex justify-between"><span className="text-dark-400">From</span><span className="font-medium">{vehicle.purchased_from || '-'}</span></div>
          </div>
        </div>
        
        {vehicle.status === 'Sold' && (
          <div className="card mb-4">
            <h2 className="font-semibold mb-3">Sale Info</h2>
            <div className="space-y-3">
              <div className="flex justify-between"><span className="text-dark-400">Sale Price</span><span className="font-medium text-primary-400">{formatCurrency(vehicle.sale_price)}</span></div>
              <div className="flex justify-between"><span className="text-dark-400">Sale Date</span><span className="font-medium">{formatDate(vehicle.sale_date)}</span></div>
              <div className="flex justify-between"><span className="text-dark-400">Customer</span><span className="font-medium">{vehicle.client_customer || '-'}</span></div>
              <div className="flex justify-between"><span className="text-dark-400">Profit</span><span className={`font-medium ${profit > 0 ? 'text-green-400' : 'text-red-400'}`}>{formatCurrency(profit)}</span></div>
            </div>
          </div>
        )}
        
        {vehicle.notes && (
          <div className="card">
            <h2 className="font-semibold mb-2">Notes</h2>
            <p className="text-dark-300">{vehicle.notes}</p>
          </div>
        )}
      </div>
      
      {vehicle.status === 'In Stock' && (
        <div className="fixed bottom-20 left-0 right-0 p-4 bg-dark-900/95 border-t border-dark-800">
          <div className="flex gap-3 max-w-7xl mx-auto">
            <button className="btn-secondary flex-1">Add Expense</button>
            <button className="btn-primary flex-1">Create Deal</button>
          </div>
        </div>
      )}
    </div>
  )
}