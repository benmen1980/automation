import { Link } from 'react-router-dom';
import Badge from './Badge.jsx';

function fmt(dt) {
  return dt ? new Date(dt).toLocaleString() : '—';
}

export default function ExecutionsTable({ executions }) {
  if (executions.length === 0) {
    return <p className="text-sm text-slate-500">No executions yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500 border-b border-slate-200">
            <th className="py-2 pr-3">Trigger</th>
            <th className="py-2 pr-3">Mode</th>
            <th className="py-2 pr-3">Status</th>
            <th className="py-2 pr-3">Started</th>
            <th className="py-2 pr-3">Finished</th>
            <th className="py-2 pr-3" />
          </tr>
        </thead>
        <tbody>
          {executions.map((exec) => (
            <tr key={exec.id} className="border-b border-slate-100">
              <td className="py-2 pr-3">{exec.triggerType}</td>
              <td className="py-2 pr-3">{exec.executionMode}</td>
              <td className="py-2 pr-3">
                <Badge value={exec.status} />
              </td>
              <td className="py-2 pr-3 text-slate-500">{fmt(exec.startedAt)}</td>
              <td className="py-2 pr-3 text-slate-500">{fmt(exec.finishedAt)}</td>
              <td className="py-2 pr-3">
                <Link to={`/executions/${exec.id}`} className="text-slate-600 hover:underline">
                  Details
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
