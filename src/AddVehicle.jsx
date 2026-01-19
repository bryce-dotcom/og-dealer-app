import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { ArrowLeft, Camera, Loader2 } from 'lucide-react'

export default function AddVehicle() {
  const navigate = useNavigate()
  const addVehicle = useStore((state) => state.addVehicle)
  
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    unit_id: '',
    year: '',
    make: '',
    model: '',
    trim: '',
    vin: '',
    miles: '',
    color: '',
    purchased_from: '',
    purchase_price: '',
    date_acquired: new Date().toISOString().split('T')[0],
    notes: ''
  })
  
  const handleChange = (e) => {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }
  
  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    
    const vehicleData = {
      ...form,
      year: form.year ? parseInt(form.year) : null,
      miles: form.miles ? parseInt(form.miles) : null,
      purchase_price: form.purchase_price ? parseFloat(form.purchase_price) : null,
      status: 'In Stock'
    }
    
    const { data, error } = await addVehicle(vehicleData)
    
    setLoading(false)
    
    if (error) {
      alert('Error adding vehicle: ' + error.message)
    } else {
      navigate('/inventory')
    }
  }
  
  return (
    <div className="pb-24">
      <div className="sticky top-14 z-30 bg-dark-900 border-b border-dark-800 px-4 py-3">
        <div className="flex items-center justify-between">
          <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-dark-400">
            <ArrowLeft size={20} />
            <span>Cancel</span>
          </button>
          <h1 className="font-semibold">Add Vehicle</h1>
          <div className="w-16" />
        </div>
      </div>
      
      <form onSubmit={handleSubmit} className="p-4 max-w-lg mx-auto">
        <div className="mb-6">
          <div className="h-40 bg-dark-800 rounded-xl border-2 border-dashed border-dark-600 flex flex-col items-center justify-center cursor-pointer hover:border-primary-500 transition-colors">
            <Camera className="text-dark-500 mb-2" size={32} />
            <p className="text-dark-400 text-sm">Add Photos</p>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">Unit ID *</label>
            <input type="text" name="unit_id" value={form.unit_id} onChange={handleChange} placeholder="2025-1" required className="input w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">VIN</label>
            <input type="text" name="vin" value={form.vin} onChange={handleChange} placeholder="17 characters" maxLength={17} className="input w-full" />
          </div>
        </div>
        
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">Year</label>
            <input type="number" name="year" value={form.year} onChange={handleChange} placeholder="2024" className="input w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">Make</label>
            <input type="text" name="make" value={form.make} onChange={handleChange} placeholder="Ford" className="input w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">Model</label>
            <input type="text" name="model" value={form.model} onChange={handleChange} placeholder="F-150" className="input w-full" />
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">Trim</label>
            <input type="text" name="trim" value={form.trim} onChange={handleChange} placeholder="XLT" className="input w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">Color</label>
            <input type="text" name="color" value={form.color} onChange={handleChange} placeholder="Black" className="input w-full" />
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">Miles</label>
            <input type="number" name="miles" value={form.miles} onChange={handleChange} placeholder="50000" className="input w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">Date Acquired</label>
            <input type="date" name="date_acquired" value={form.date_acquired} onChange={handleChange} className="input w-full" />
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">Purchased From</label>
            <input type="text" name="purchased_from" value={form.purchased_from} onChange={handleChange} placeholder="Manheim" className="input w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">Purchase Price</label>
            <input type="number" name="purchase_price" value={form.purchase_price} onChange={handleChange} placeholder="15000" step="0.01" className="input w-full" />
          </div>
        </div>
        
        <div className="mb-6">
          <label className="block text-sm font-medium text-dark-300 mb-1">Notes</label>
          <textarea name="notes" value={form.notes} onChange={handleChange} placeholder="Any notes..." rows={3} className="input w-full" />
        </div>
        
        <button type="submit" disabled={loading || !form.unit_id} className="btn-primary w-full flex items-center justify-center gap-2 py-3">
          {loading ? (<><Loader2 className="animate-spin" size={20} />Adding...</>) : 'Add Vehicle'}
        </button>
      </form>
    </div>
  )
}