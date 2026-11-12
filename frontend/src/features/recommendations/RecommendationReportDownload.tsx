import { buildRecommendationReport, reportFilename, type ReportInput } from './recommendationReport';
import { downloadReportPdf } from './reportPdf';

export function RecommendationReportDownload({ report }: { report?: ReportInput }) {
  return <div className="rec-report">
    <h3><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></svg>Full report (PDF)</h3>
    <p>Everything behind this recommendation, for your records:</p>
    <ul>
      <li>Full method and decision rules</li>
      <li>All assumptions and limitations</li>
      <li>Data sources and timestamps</li>
      <li>Model version and evaluation</li>
    </ul>
    <button type="button" className="bb-button bb-button--secondary" disabled={!report}
      onClick={() => { if (report) downloadReportPdf(reportFilename(report.plan), buildRecommendationReport(report)); }}>Download report</button>
  </div>;
}
