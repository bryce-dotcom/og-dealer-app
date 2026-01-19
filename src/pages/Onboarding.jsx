import DealerOnboarding from '../components/DealerOnboarding';

export default function Onboarding() {
  return (
    <div className="fixed inset-0 z-50 bg-black overflow-y-auto">
      <div className="min-h-full flex flex-col items-center justify-start py-12 px-6">
        
        <div className="mb-10">
          <img 
            src="/OGDiXDealerApp.png" 
            alt="OG DiX Dealer App" 
            className="h-32 w-auto"
          />
        </div>
        
        <div className="w-full max-w-3xl">
          <DealerOnboarding onComplete={() => window.location.href = '/dashboard'} />
        </div>
        
      </div>
    </div>
  );
}