import { Shield, AlertTriangle, CheckCircle } from 'lucide-react'
import { useStore } from '../lib/store'

export default function ComplianceDashboard() {
  const inventory = useStore((state) => state.inventory)

  const urgentTitles = inventory.filter((v) => {
    if (!v.date_acquired || v.status === 'Sold') return false
    const days = Math.floor((new Date() - new Date(v.date_acquired)) / (1000 * 60 * 60 * 24))
    return days > 30 && days <= 45
  })

  const overdueTitles = inventory.filter((v) => {
    if (!v.date_acquired || v.status === 'Sold') return false
    const days = Math.floor((new Date() - new Date(v.date_acquired)) / (1000 * 60 * 60 * 24))
    return days > 45
  })

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <h1 className="text-xl font-bold mb-4 flex items-center gap-2">
        <Shield className="text-primary-400" size={24} />
        Compliance Dashboard
      </h1>

      <div className="space-y-4">
        <div className="card">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-yellow-400 mt-1" size={20} />
            <div>
              <h3 className="font-medium">Titles Approaching Deadline</h3>
              <p className="text-sm text-dark-300 mt-1">
                {urgentTitles.length} title(s) approaching 45-day deadline
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-red-400 mt-1" size={20} />
            <div>
              <h3 className="font-medium">Overdue Titles</h3>
              <p className="text-sm text-dark-300 mt-1">
                {overdueTitles.length} title(s) past 45-day deadline
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-start gap-3">
            <CheckCircle className="text-green-400 mt-1" size={20} />
            <div>
              <h3 className="font-medium">Compliance Status</h3>
              <p className="text-sm text-dark-300 mt-1">
                {overdueTitles.length === 0 ? 'All titles compliant' : 'Action required'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}