// SI-assisted code implementing published NASA equations from NASA-TM-X-74335, NASA TR R-376, NASA-STD-4010A, and NASA GSFC Orbit Primer.

import React from 'react';
import { X, ExternalLink, BookOpen } from 'lucide-react';
import { NASA_CITATIONS } from '../data/nasaCatalog';

interface CitationsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CitationsModal: React.FC<CitationsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const categories = Array.from(new Set(NASA_CITATIONS.map((c) => c.category)));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="citations-modal-title"
    >
      <div className="flex max-h-[88vh] w-full max-w-4xl flex-col rounded-lg border border-slate-700 bg-[#0B1120] shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <BookOpen className="h-5 w-5 text-cyan-400" aria-hidden="true" />
            <div>
              <h2 id="citations-modal-title" className="font-display text-lg font-semibold text-slate-100">
                Engineering Equations &amp; Official Citations
              </h2>
              <p className="text-xs text-slate-400">
                Published technical standards and open-data equations implemented in this simulator
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close equations and citations modal"
            className="rounded-md border border-slate-700 bg-slate-900 p-2 text-slate-300 transition-colors hover:border-slate-500 hover:text-white focus-visible:outline-2 focus-visible:outline-cyan-400"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-6">
          <div className="rounded-md border border-slate-800 bg-slate-900/70 p-4 text-xs leading-relaxed text-slate-300">
            <p className="font-medium text-cyan-300 mb-1">Sourcing &amp; Compliance Notice</p>
            <p>
              All atmospheric tables, propulsion constants, aerothermal heating correlations, material thermal limits,
              and orbital perturbation models are derived exclusively from published NASA Technical Reports Server (NTRS)
              documents, NASA technical standards, and official open APIs.
            </p>
          </div>

          {categories.map((category) => (
            <section key={category} className="space-y-3">
              <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-cyan-400 border-b border-slate-800 pb-1.5">
                {category}
              </h3>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {NASA_CITATIONS.filter((item) => item.category === category).map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col justify-between rounded-md border border-slate-800 bg-[#0F172A] p-4"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-sm font-semibold text-slate-100">{item.title}</h4>
                      </div>
                      <p className="mt-1 font-mono-tabular text-[11px] text-amber-300/90">{item.referenceId}</p>
                      <p className="mt-2 font-mono-tabular text-xs leading-relaxed text-slate-300">
                        {item.equationSummary}
                      </p>
                    </div>
                    <div className="mt-3 pt-2 border-t border-slate-800/80">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-400 hover:text-cyan-300 hover:underline"
                      >
                        <span>View Source Document</span>
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="flex items-center justify-end border-t border-slate-800 px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-cyan-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-cyan-500"
          >
            Return to Console
          </button>
        </div>
      </div>
    </div>
  );
};
