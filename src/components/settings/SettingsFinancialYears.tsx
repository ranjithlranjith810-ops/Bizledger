"use client";

import React, { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { financialYearForDate } from "@/lib/financialYear";

function fmtDate(value: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 10);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

type FyDraft = { name: string; startDate: string; endDate: string };

export const SettingsFinancialYears: React.FC = () => {
  const {
    financialYears,
    activeFinancialYearId,
    setActiveFinancialYear,
    addFinancialYear,
    updateFinancialYear,
    deleteFinancialYear,
  } = useApp();

  // The FY that contains today — the automatic rollover target. Distinct from
  // the "active" FY: when the active FY is in the past, the app rolls forward to
  // this one before issuing new document numbers. Surfacing it lets the user see
  // where documents will go next after a rollover.
  const currentFinancialYearId = useMemo(() => {
    try {
      return financialYearForDate(new Date()).id;
    } catch {
      return null;
    }
  }, []);

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<FyDraft>({
    name: "",
    startDate: "",
    endDate: "",
  });
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<FyDraft>({ name: "", startDate: "", endDate: "" });

  const startAdd = () => {
    setDraft({ name: "", startDate: "", endDate: "" });
    setAdding(true);
  };

  const confirmAdd = () => {
    if (!draft.name.trim() || !draft.startDate || !draft.endDate) return;
    addFinancialYear({
      name: draft.name.trim(),
      startDate: new Date(draft.startDate).toISOString(),
      endDate: new Date(draft.endDate).toISOString(),
    });
    setAdding(false);
  };

  const startEdit = (id: string) => {
    const fy = financialYears.find((f) => f.id === id);
    if (!fy) return;
    setEditId(id);
    setEditDraft({
      name: fy.name,
      startDate: fmtDate(fy.startDate) === "—" ? "" : fy.startDate.slice(0, 10),
      endDate: fy.endDate.slice(0, 10),
    });
  };

  const confirmEdit = (id: string) => {
    if (!editDraft.name.trim() || !editDraft.startDate || !editDraft.endDate) return;
    updateFinancialYear(id, {
      name: editDraft.name.trim(),
      startDate: new Date(editDraft.startDate).toISOString(),
      endDate: new Date(editDraft.endDate).toISOString(),
    });
    setEditId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#191c1e] tracking-tight">Financial Year</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Manage the accounting periods your books, reports and dashboards use. The active
            financial year is shown in the top bar. When its period ends, the books roll forward
            to the current year automatically before the next document is numbered.
          </p>
        </div>
        {!adding && (
          <button
            onClick={startAdd}
            className="inline-flex items-center gap-1.5 bg-[#93000b] hover:bg-[#770008] text-white px-4 py-2 rounded-lg text-xs font-bold shadow-xs transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            Add Financial Year
          </button>
        )}
      </div>

      {adding && (
        <div className="bg-white p-5 rounded-xl border border-[#eceef0] shadow-xs space-y-4">
          <div className="flex items-center gap-2 font-bold text-[#191c1e] uppercase tracking-wider">
            <span className="material-symbols-outlined text-[18px] text-[#93000b]">calendar_month</span>
            <span>New Financial Year</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="sm:col-span-3">
              <label className="block text-xs font-semibold text-on-surface mb-1.5">Name</label>
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Financial Year 2027-28"
                className="w-full px-3 py-2 text-xs bg-[#f7f9fb] border border-[#eceef0] focus:border-[#93000b] focus:bg-white rounded-lg outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-on-surface mb-1.5">Start date</label>
              <input
                type="date"
                value={draft.startDate}
                onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-[#f7f9fb] border border-[#eceef0] focus:border-[#93000b] focus:bg-white rounded-lg outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-on-surface mb-1.5">End date</label>
              <input
                type="date"
                value={draft.endDate}
                onChange={(e) => setDraft({ ...draft, endDate: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-[#f7f9fb] border border-[#eceef0] focus:border-[#93000b] focus:bg-white rounded-lg outline-none"
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                onClick={confirmAdd}
                disabled={!draft.name.trim() || !draft.startDate || !draft.endDate}
                className="bg-[#93000b] hover:bg-[#770008] text-white px-4 py-2 rounded-lg text-xs font-bold shadow-xs transition-colors disabled:opacity-40"
              >
                Save FY
              </button>
              <button
                onClick={() => setAdding(false)}
                className="px-3 py-2 rounded-lg border border-[#eceef0] text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-[#eceef0] shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#f7f9fb] text-[#191c1e]">
              <tr>
                <th className="px-4 py-3 font-bold uppercase tracking-wider">Name</th>
                <th className="px-4 py-3 font-bold uppercase tracking-wider">Start</th>
                <th className="px-4 py-3 font-bold uppercase tracking-wider">End</th>
                <th className="px-4 py-3 font-bold uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 font-bold uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f3f5]">
              {financialYears.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                    No financial years yet. Add one to get started.
                  </td>
                </tr>
              )}
              {financialYears.map((fy) => {
                const isActive = fy.id === activeFinancialYearId;
                const isEditing = editId === fy.id;
                return (
                  <tr key={fy.id} className={isActive ? "bg-[#f0fdf4]" : ""}>
                    {isEditing ? (
                      <td colSpan={5} className="px-4 py-2">
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
                          <div className="sm:col-span-2">
                            <label className="block text-[11px] font-semibold text-on-surface mb-1">Name</label>
                            <input
                              value={editDraft.name}
                              onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                              className="w-full px-3 py-1.5 text-xs bg-[#f7f9fb] border border-[#eceef0] focus:border-[#93000b] focus:bg-white rounded-lg outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-on-surface mb-1">Start</label>
                            <input
                              type="date"
                              value={editDraft.startDate}
                              onChange={(e) => setEditDraft({ ...editDraft, startDate: e.target.value })}
                              className="w-full px-3 py-1.5 text-xs bg-[#f7f9fb] border border-[#eceef0] focus:border-[#93000b] focus:bg-white rounded-lg outline-none"
                            />
                          </div>
                          <div className="flex gap-2">
                            <div className="flex-1">
                              <label className="block text-[11px] font-semibold text-on-surface mb-1">End</label>
                              <input
                                type="date"
                                value={editDraft.endDate}
                                onChange={(e) => setEditDraft({ ...editDraft, endDate: e.target.value })}
                                className="w-full px-3 py-1.5 text-xs bg-[#f7f9fb] border border-[#eceef0] focus:border-[#93000b] focus:bg-white rounded-lg outline-none"
                              />
                            </div>
                            <div className="flex gap-1.5 pb-0.5">
                              <button
                                onClick={() => confirmEdit(fy.id)}
                                className="bg-[#93000b] hover:bg-[#770008] text-white px-3 py-1.5 rounded-lg text-[11px] font-bold"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditId(null)}
                                className="px-2.5 py-1.5 rounded-lg border border-[#eceef0] text-[11px] font-semibold text-gray-600 hover:bg-gray-100"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        </div>
                      </td>
                    ) : (
                      <React.Fragment>
                        <td className="px-4 py-3 font-semibold text-[#191c1e]">{fy.name}</td>
                        <td className="px-4 py-3 text-gray-500">{fmtDate(fy.startDate)}</td>
                        <td className="px-4 py-3 text-gray-500">{fmtDate(fy.endDate)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {isActive && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-[#dcfce7] text-[#166534] px-2.5 py-0.5 text-[11px] font-bold">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#15803d]" />
                                Active
                              </span>
                            )}
                            {!isActive && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-[#f1f5f9] text-gray-500 px-2.5 py-0.5 text-[11px] font-semibold">
                                Inactive
                              </span>
                            )}
                            {fy.id === currentFinancialYearId && (
                              <span
                                className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 px-2.5 py-0.5 text-[11px] font-bold"
                                title="Contains today's date — the automatic rollover target for new documents"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                Current
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            {!isActive && (
                              <button
                                onClick={() => setActiveFinancialYear(fy.id)}
                                className="text-[11px] font-bold text-[#166534] hover:underline"
                              >
                                Set active
                              </button>
                            )}
                            <button
                              onClick={() => startEdit(fy.id)}
                              className="text-[11px] font-bold text-gray-600 hover:text-[#191c1e]"
                            >
                              Edit
                            </button>
                            {financialYears.length > 1 && !isActive && (
                              <button
                                onClick={() => deleteFinancialYear(fy.id)}
                                className="text-[11px] font-bold text-[#93000b] hover:underline"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </React.Fragment>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-gray-400">
        At least one financial year must always remain. Reports and the dashboard automatically use
        the currently active financial year. &ldquo;Current&rdquo; marks the year containing today &mdash; new
        documents roll over to it automatically when the active year ends.
      </p>
    </div>
  );
};
