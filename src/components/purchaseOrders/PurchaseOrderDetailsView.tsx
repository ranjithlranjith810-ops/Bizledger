"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { PurchaseOrder } from "@/types";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { DocPrintSheet, PrintItem, PrintMetaRow } from "@/components/shared/DocPrintSheet";
import { AddPurchaseOrderModal } from "@/components/purchaseOrders/AddPurchaseOrderModal";

const STATUS_COLORS: Record<string, string> = {
  Draft: "bg-gray-100 text-gray-700 border-gray-200",
  Sent: "bg-blue-50 text-blue-700 border-blue-200",
  Accepted: "bg-indigo-50 text-indigo-700 border-indigo-200",
  "Partially Received": "bg-amber-50 text-amber-700 border-amber-200",
  Received: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Cancelled: "bg-rose-50 text-rose-700 border-rose-200",
};

const STATUS_OPTIONS = [
  "Draft",
  "Sent",
  "Accepted",
  "Partially Received",
  "Received",
  "Cancelled",
];

export const PurchaseOrderDetailsView: React.FC = () => {
  const {
    purchaseOrders,
    updatePurchaseOrderStatus,
    addNotification,
    setDeleteConfirm,
  } = useApp();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [editing, setEditing] = useState(false);

  const po = purchaseOrders.find((p) => p.id === params.id);

  if (!po) {
    return (
      <div className="space-y-6">
        <div className="p-8 text-center text-gray-400">
          Purchase order not found.
        </div>
      </div>
    );
  }

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = () => {
    addNotification({
      type: "success",
      title: "Purchase Order PDF Ready",
      message: `Purchase order ${po.poNumber} has been downloaded.`,
    });
  };

  const handleDelete = () => {
    setDeleteConfirm({
      kind: "purchaseOrder",
      id: po.id,
      name: po.poNumber,
    });
  };

  const handleStatusChange = (status: string) => {
    updatePurchaseOrderStatus(po.id, status as PurchaseOrder["status"]);
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
          <select
            value={po.status}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="bg-white border border-[#eceef0] focus:border-[#93000b] py-2 px-2 rounded-lg text-xs font-semibold outline-none text-gray-700"
            title="Change status"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-[#eceef0] hover:bg-gray-100 text-gray-700 rounded-lg text-xs font-semibold transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">edit</span>
            <span>Edit</span>
          </button>

          <button
            onClick={handlePrint}
            className="p-2 bg-white border border-[#eceef0] hover:bg-gray-100 text-gray-700 rounded-lg transition-colors"
            title="Print"
          >
            <Printer className="w-4 h-4" />
          </button>

          <button
            onClick={handleDownloadPdf}
            className="flex items-center gap-1.5 bg-[#93000b] hover:bg-[#770008] text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-xs transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Download PDF</span>
          </button>

          <button
            onClick={handleDelete}
            className="p-2 bg-white border border-[#eceef0] hover:bg-rose-50 hover:text-rose-700 text-gray-700 rounded-lg transition-colors"
            title="Delete"
          >
            <span className="material-symbols-outlined text-[18px]">
              delete
            </span>
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

      {editing && (
        <AddPurchaseOrderModal po={po} onClose={() => setEditing(false)} />
      )}
    </div>
  );
};