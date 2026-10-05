"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { PurchaseOrder } from "@/types";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { DocPrintSheet, PrintItem, PrintMetaRow } from "@/components/shared/DocPrintSheet";
import {
  purchaseOrdersApi,
  fromBackendPurchaseOrder,
} from "@/lib/api/purchaseOrders";
import { isTemporaryId } from "@/lib/optimistic-id";
import { ApiError } from "@/lib/api-client";
import { nextPurchaseOrderStatuses } from "@/lib/sales-document/status-transitions";
import { Icon } from "../ui/Icon";
import {
  renderDocumentPdf,
  documentPdfFilename,
} from "@/lib/print/document-pdf";

const STATUS_COLORS: Record<string, string> = {
  Draft: "bg-gray-100 text-gray-700 border-gray-200",
  Sent: "bg-blue-50 text-blue-700 border-blue-200",
  Accepted: "bg-indigo-50 text-indigo-700 border-indigo-200",
  "Partially Received": "bg-amber-50 text-amber-700 border-amber-200",
  Received: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Cancelled: "bg-rose-50 text-rose-700 border-rose-200",
};

/**
 * Status lifecycle notes for this view.
 *
 * Selectable options are derived from PURCHASE_ORDER_STATUS_TRANSITIONS (via
 * nextPurchaseOrderStatuses) — the same authoritative matrix the server
 * validates against — so an illegal target is never offered. UX only, never a
 * security boundary: the server re-reads the stored status and rejects an
 * illegal edge. A terminal status (Received / Cancelled) renders read-only.
 */
export const PurchaseOrderDetailsView: React.FC = () => {
  const {
    purchaseOrders,
    updatePurchaseOrderStatus,
    addNotification,
    companyProfile,
    activeBusinessId,
    transitioningDocument,
  } = useApp();
  const router = useRouter();
  const params = useParams<{ id: string }>();
const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [fetchResult, setFetchResult] = useState<{
    id: string;
    record: PurchaseOrder | null;
    error: "missing" | "error" | null;
  } | null>(null);

  // Fix C: deep links / reloads had no state to resolve, so they always
  // rendered "not found". Fetch the authoritative record instead. The result is
  // keyed by id so a previous route's record is never shown, and the status is
  // derived during render rather than reset inside the effect.
  const poFromState = purchaseOrders.find((p) => p.id === params.id);
  const current = fetchResult?.id === params.id ? fetchResult : null;
  const po = poFromState ?? current?.record ?? null;
  const fetchStatus: "idle" | "loading" | "saving" | "missing" | "error" = (() => {
    if (poFromState) return "idle";
    if (isTemporaryId(params.id)) return "saving";
    if (!activeBusinessId) return "idle";
    if (current === null) return "loading";
    return current.error ?? "idle";
  })();

  useEffect(() => {
    if (poFromState) return;
    if (isTemporaryId(params.id)) return;
    if (!activeBusinessId) return;
    let cancelled = false;
    purchaseOrdersApi
      .get(activeBusinessId, params.id)
      .then((r) => fromBackendPurchaseOrder(r.purchaseOrder))
      .then((record) => {
        if (cancelled) return;
        setFetchResult({ id: params.id, record, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setFetchResult({
          id: params.id,
          record: null,
          error: err instanceof ApiError && err.status === 404 ? "missing" : "error",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [poFromState, activeBusinessId, params.id]);

  if (!po) {
    let message = "Purchase order not found.";
    if (fetchStatus === "loading") message = "Loading purchase order...";
    else if (fetchStatus === "saving")
      message = "This purchase order is still being saved...";
    else if (fetchStatus === "error")
      message = "This purchase order could not be loaded.";
    return (
      <div className="space-y-6">
        <div className="p-8 text-center text-gray-400">{message}</div>
      </div>
    );
  }

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    if (downloadingPdf) return;
    setDownloadingPdf(true);
    try {
      const bytes = await renderDocumentPdf(companyProfile, {
        banner: "PURCHASE ORDER",
        docNumber: po.poNumber,
        metaRows,
        party: {
          title: "Vendor (Supplier)",
          name: po.vendor.name,
          address: po.vendor.address,
          phone: po.vendor.phone,
          gstin: po.vendor.gstin,
          extraRows: [
            ...(po.vendor.contactPerson
              ? [{ label: "Contact Person", value: po.vendor.contactPerson }]
              : []),
            ...(po.vendor.email
              ? [{ label: "Email", value: po.vendor.email }]
              : []),
          ],
        },
        deliveryBlock: {
          deliveryAddress: po.deliveryAddress,
          deliveryMode: po.deliveryMode,
        },
        items,
        subtotal: po.subtotal,
        cgst: po.cgst,
        sgst: po.sgst,
        total: po.grandTotal,
        notes: po.notes,
        terms: po.terms,
        footerNote: "This is a purchase order, not a tax invoice.",
      });
      const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = documentPdfFilename(po.poNumber, "purchase-order");
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      addNotification({
        type: "error",
        title: "Could not download PDF",
        message:
          err instanceof Error
            ? err.message
            : "Try the Print button instead.",
      });
    } finally {
      setDownloadingPdf(false);
    }
  };

  // NOTE: purchase orders are NOT deletable. There is deliberately no Delete
  // action here and no delete path in the context or the API — a PO that is no
  // longer wanted is closed with Cancelled via the status control below, never
  // erased.

  // True only while THIS document's transition is in flight; the status itself
  // is never mutated locally — the context swaps in the server's response.
  const isTransitioning = transitioningDocument?.id === po.id;

  // Legal destinations only, from the shared authoritative matrix.
  const nextStatusOptions: readonly string[] = nextPurchaseOrderStatuses(po.status);

  const handleStatusChange = (status: string) => {
    void updatePurchaseOrderStatus(po.id, status as PurchaseOrder["status"]);
  };

  const metaRows: PrintMetaRow[] = [
    { label: "PO Date", value: po.date },
    ...(po.deliveryDate
      ? [{ label: "Delivery Date", value: po.deliveryDate }]
      : []),
    {
      label: "Price Type",
      value: po.pricingMode === "exclusive" ? "GST Exclusive" : "GST Inclusive",
    },
  ];

  const items: PrintItem[] = po.items.map((it) => ({
    id: it.id,
    description: it.description,
    hsnSac: it.hsnSac,
    quantity: it.quantity,
    unit: it.unit,
    unitPrice: it.unitPrice,
    taxableAmount: it.taxableAmount,
    gstRate: it.gstRate,
    totalAmount: it.totalAmount,
  }));

  return (
    <div className="space-y-6 animate-in fade-in max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/purchase-orders")}
            className="p-2 bg-white border border-[#eceef0] hover:bg-gray-100 text-gray-600 rounded-xl transition-colors shadow-xs"
            title="Back to Purchase Orders"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-bold text-[#191c1e] font-mono tracking-tight">
                {po.poNumber}
              </h2>
              <span
                className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                  STATUS_COLORS[po.status] || STATUS_COLORS.Draft
                }`}
              >
                {po.status}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Ordered from{" "}
              <strong className="text-gray-800">{po.vendor.name}</strong> on{" "}
              {po.date}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {nextStatusOptions.length === 0 ? (
            <span
              className="rounded-lg border border-[#eceef0] bg-white px-3 py-2 text-xs font-semibold text-gray-500"
              title={`${po.status} is a final status and cannot be changed`}
            >
              {po.status}
            </span>
          ) : (
            <select
              value={po.status}
              onChange={(e) => handleStatusChange(e.target.value)}
              disabled={isTransitioning}
              aria-busy={isTransitioning}
              className="bg-white border border-[#eceef0] focus:border-[#93000b] py-2 px-2 rounded-lg text-xs font-semibold outline-none text-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
              title={
                isTransitioning
                  ? "Saving status…"
                  : `Change status (next: ${nextStatusOptions.join(", ")})`
              }
            >
              <option value={po.status}>{po.status}</option>
              {nextStatusOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}

          <button
            onClick={handlePrint}
            className="p-2 bg-white border border-[#eceef0] hover:bg-gray-100 text-gray-700 rounded-lg transition-colors"
            title="Print"
          >
            <Printer className="w-4 h-4" />
          </button>

          <button
            onClick={handleDownloadPdf}
            disabled={downloadingPdf}
            className="flex items-center gap-1.5 bg-[#93000b] hover:bg-[#770008] text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-xs transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            title="Download this purchase order as a PDF file"
          >
            {downloadingPdf ? (
              <Icon name="progress_activity" className="text-[16px] animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span>{downloadingPdf ? "Generating PDF..." : "Download PDF"}</span>
          </button>
        </div>
      </div>

      <DocPrintSheet
        banner="PURCHASE ORDER"
        subtitle="Official order issued by the buyer to the supplier"
        docNumber={po.poNumber}
        metaRows={metaRows}
        party={{
          title: "Vendor (Supplier)",
          name: po.vendor.name,
          address: po.vendor.address,
          phone: po.vendor.phone,
          gstin: po.vendor.gstin,
          extraRows: [
            ...(po.vendor.contactPerson
              ? [{ label: "Contact Person", value: po.vendor.contactPerson }]
              : []),
            ...(po.vendor.email
              ? [{ label: "Email", value: po.vendor.email }]
              : []),
          ],
        }}
        deliveryBlock={{
          deliveryAddress: po.deliveryAddress,
          deliveryMode: po.deliveryMode,
        }}
        items={items}
        subtotal={po.subtotal}
        cgst={po.cgst}
        sgst={po.sgst}
        total={po.grandTotal}
        notes={po.notes}
        terms={po.terms}
        showBank={false}
        signature
        footerNote="This is a purchase order, not a tax invoice."
      />
    </div>
  );
};