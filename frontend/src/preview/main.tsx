import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PreviewApp } from './PreviewApp';
import { navigate } from '../app/router';
import { RECOMMENDATION_DEMO_PLAN } from '../features/recommendations/mockService';

// Dedicated local preview entry; the normal app keeps Clerk and real services.
// Open the starting recommendation state directly; without a plan id the page shows "No saved purchase plan".
navigate(`/purchase-plans/recommendation?plan_id=${RECOMMENDATION_DEMO_PLAN.plan_id}`, true);
createRoot(document.getElementById('root')!).render(<StrictMode><PreviewApp /></StrictMode>);
