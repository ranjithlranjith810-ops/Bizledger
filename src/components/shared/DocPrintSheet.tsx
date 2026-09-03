"use client";

import React from "react";
import { useApp } from "@/context/AppContext";

export interface PrintItem {
  id: string;
  description: string;
  hsnSac?: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  taxableAmount: number;
  gstRate: number;
  totalAmount: number;
}

export interface PrintMetaRow {
  label: string;
  value: string;
}

export interface PartyBlock {
  title: string;
  name: string;
  address?: string;
  phone?: string;
  gstin?: string;
  extraRows?: { label: string; value: string }[];
}

interface DocPrintSheetProps {
  banner: string;
  subtitle?: string;
  docNumber: string;
  metaRows: PrintMetaRow[];
  party?: PartyBlock;
  buyerBlock?: PartyBlock;
  deliveryBlock?: { deliveryDate?: string; deliveryAddress?: string; deliveryMode?: string };
  items: PrintItem[];
  subtotal: number;
  cgst: number;
  sgst: number;
  total: number;
  notes?: string;
  terms?: string;
  showBank?: boolean;
  signature?: boolean;
  approximate?: boolean;
  footerNote?: string;
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export const DocPrintSheet: React.FC<DocPrintSheetProps> = ({
  banner,
  subtitle,
  docNumber,
  metaRows,
  party,
  buyerBlock,
  deliveryBlock,
  items,
  subtotal,
  cgst,
  sgst,
  total,
  notes,
  terms,
  showBank = false,
  signature = true,
  approximate = false,
  footerNote,
}) => {
  const { companyProfile } = useApp();

  return (
    <div className="bg-white rounded-2xl border border-[#eceef0] shadow-sm p-6 sm:p-8 space-y-6 text-xs text-gray-800">
      {/* Document Banner */}
      <div className="text-center pb-4 border-b border-gray-200">
        <span className="text-[11px] font-bold tracking-widest text-[#93000b] uppercase">
          {banner}
        </span>
        {subtitle && (
          <span className="block text-[10px] font-semibold text-amber-700 mt-1 uppercase tracking-wider">
            {subtitle}
          </span>
        )}
      </div>

      {/* Company Header & Meta */}
      <div className="flex flex-col sm:flex-row justify-between gap-6 pb-6 border-b border-gray-100">
        {/* Company / Supplier */}
        <div className="space-y-1 max-w-sm">
          <div className="flex items-center gap-2">
            {companyProfile.logoUrl ? (
              <img
                src={companyProfile.logoUrl}
                alt="Logo"
                className="w-8 h-8 rounded-lg object-cover"
              />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-rose-50 text-[#93000b] flex items-center justify-center font-bold text-xs">
                BL
              </div>
            )}
            <h3 className="font-bold text-sm text-gray-900">
              {companyProfile.companyName}
            </h3>
          </div>
          <p className="text-gray-600 text-xs leading-tight">
            {companyProfile.streetAddress}
          </p>
          <p className="text-gray-600 text-xs">
            {companyProfile.city}, {companyProfile.state} -{" "}
            {companyProfile.pincode}
          </p>
          <div className="pt-1 text-[11px] font-medium text-gray-700">
            <div>
              GSTIN:{" "}
              <span className="font-mono font-bold text-gray-900">
                {companyProfile.gstin}
              </span>
            </div>
            <div>
              PAN:{" "}
              <span className="font-mono font-bold text-gray-900">
                {companyProfile.pan}
              </span>
            </div>
          </div>
        </div>

        {/* Document Identification */}
        <div className="bg-[#f7f9fb] p-4 rounded-xl border border-[#eceef0] sm:min-w-64 space-y-2 text-xs">
          <div className="flex justify-between gap-4">
            <span className="text-gray-500 font-medium">Document #:</span>
            <span className="font-mono font-bold text-[#93000b] text-right">
              {docNumber}
            </span>
          </div>
          {metaRows.map((row) => (
            <div key={row.label} className="flex justify-between gap-4">
              <span className="text-gray-500 font-medium">{row.label}:</span>
              <span className="font-semibold text-gray-900 text-right">
                {row.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Buyer (for Purchase Order) */}
      {buyerBlock && (
        <div className="bg-[#f7f9fb] p-4 rounded-xl border border-[#eceef0] space-y-2 text-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
            {buyerBlock.title}
          </span>
          <div className="pt-1">
            <div className="font-bold text-sm text-gray-900">
              {buyerBlock.name}
            </div>
            {buyerBlock.address && (
              <p className="text-gray-600 mt-0.5 leading-tight">
                {buyerBlock.address}
              </p>
            )}
            {buyerBlock.gstin && (
              <div className="text-gray-600 mt-0.5">
                GSTIN:{" "}
                <span className="font-mono font-bold text-gray-900">
                  {buyerBlock.gstin}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bill To / Party */}
      {party && (
        <div className="bg-[#f7f9fb] p-4 rounded-xl border border-[#eceef0] space-y-2 text-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
            {party.title}
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div>
              <div className="font-bold text-sm text-gray-900">
                {party.name}
              </div>
              {party.address && (
                <p className="text-gray-600 mt-0.5 leading-tight">
                  {party.address}
                </p>
              )}
              {party.phone && (
                <div className="text-gray-600 mt-1">Contact: {party.phone}</div>
              )}
            </div>
            <div className="space-y-1">
              <div>
                GSTIN:{" "}
                <span className="font-mono font-bold text-gray-900">
                  {party.gstin || "-"}
                </span>
              </div>
              {party.extraRows?.map((row) => (
                <div key={row.label}>
                  {row.label}:{" "}
                  <span className="font-medium text-gray-800">{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Delivery Block (Purchase Order) */}
      {deliveryBlock &&
        (deliveryBlock.deliveryDate ||
          deliveryBlock.deliveryAddress ||
          deliveryBlock.deliveryMode) && (
          <div className="bg-[#f7f9fb] p-4 rounded-xl border border-[#eceef0] space-y-1 text-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Delivery Information
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
              {deliveryBlock.deliveryDate && (
                <div>
                  Delivery Date:{" "}
                  <span className="font-medium text-gray-800">
                    {deliveryBlock.deliveryDate}
                  </span>
                </div>
              )}
              {deliveryBlock.deliveryMode && (
                <div>
                  Delivery Mode:{" "}
                  <span className="font-medium text-gray-800">
                    {deliveryBlock.deliveryMode}
                  </span>
                </div>
              )}
              {deliveryBlock.deliveryAddress && (
                <div>
                  Delivery Address:{" "}
                  <span className="font-medium text-gray-800">
                    {deliveryBlock.deliveryAddress}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

      {/* Items Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border border-[#eceef0] rounded-xl overflow-hidden">
          <thead className="bg-[#f7f9fb] text-gray-600 border-b border-[#eceef0] text-[11px] font-semibold uppercase">
            <tr>
              <th className="py-2.5 px-3">#</th>
              <th className="py-2.5 px-3">Item Description</th>
              <th className="py-2.5 px-3 font-mono">HSN/SAC</th>
              <th className="py-2.5 px-3 text-right">Qty</th>
              <th className="py-2.5 px-3 text-right">Rate (₹)</th>
              <th className="py-2.5 px-3 text-right">Taxable (₹)</th>
              <th className="py-2.5 px-3 text-right">GST %</th>
              <th className="py-2.5 px-3 text-right">Total (₹)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#eceef0]">
            {items.map((item, idx) => (
              <tr key={item.id} className="hover:bg-gray-50/50">
                <td className="py-3 px-3 text-gray-400 font-mono">{idx + 1}</td>
                <td className="py-3 px-3">
                  <div className="font-bold text-gray-900">
                    {item.description}
                  </div>
                </td>
                <td className="py-3 px-3 font-mono text-gray-600">
                  {item.hsnSac}
                </td>
                <td className="py-3 px-3 text-right font-mono font-medium">
                  {item.quantity} {item.unit}
                </td>
                <td className="py-3 px-3 text-right font-mono">
                  {inr(item.unitPrice)}
                </td>
                <td className="py-3 px-3 text-right font-mono">
                  {inr(item.taxableAmount)}
                </td>
                <td className="py-3 px-3 text-right font-mono">
                  {item.gstRate}%
                </td>
                <td className="py-3 px-3 text-right font-mono font-bold text-gray-900">
                  {inr(item.totalAmount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Financials Summary */}
      <div className="flex flex-col sm:flex-row justify-between gap-6 pt-2">
        {showBank ? (
          <div className="sm:max-w-xs space-y-2 bg-[#f7f9fb] p-3.5 rounded-xl border border-[#eceef0] text-[11px]">
            <div className="font-bold text-gray-800 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-[#93000b]">
                account_balance
              </span>
              <span>Remittance Bank Details</span>
            </div>
            <div className="text-gray-600 space-y-0.5 font-mono">
              <div>Bank: {companyProfile.bankName}</div>
              <div>A/C: {companyProfile.accountNumber}</div>
              <div>IFSC: {companyProfile.ifscCode}</div>
              <div>UPI: {companyProfile.upiId}</div>
            </div>
          </div>
        ) : (
          <div className="text-[10px] text-gray-400 sm:max-w-xs">
            {footerNote || "This document is not a tax invoice."}
          </div>
        )}

        <div className="sm:w-72 space-y-2 text-xs divide-y divide-gray-100">
          <div className="flex justify-between py-1">
            <span className="text-gray-500">Taxable Value:</span>
            <span className="font-mono font-semibold">
              {inr(subtotal)}
            </span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-gray-500">CGST (9%):</span>
            <span className="font-mono font-semibold">{inr(cgst)}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-gray-500">SGST (9%):</span>
            <span className="font-mono font-semibold">{inr(sgst)}</span>
          </div>
          <div className="flex justify-between py-2 bg-[#fef2f2] px-3 rounded-lg border border-rose-100">
            <span className="font-bold text-[#93000b] text-sm">
              {approximate ? "Estimated Total:" : "Total (₹):"}
            </span>
            <span className="font-mono font-bold text-[#93000b] text-base">
              {inr(total)}
            </span>
          </div>
          {approximate && (
            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
              Estimated / Approximate Amount
            </div>
          )}
        </div>
      </div>

      {/* Footer & Signature */}
      <div className="pt-6 border-t border-gray-200 flex flex-col sm:flex-row items-end justify-between gap-6">
        <div className="space-y-1 text-[10px] text-gray-400 max-w-sm">
          <div className="font-bold uppercase text-gray-500">
            Terms &amp; Conditions:
          </div>
          <p>{terms || "—"}</p>
          {notes && (
            <>
              <div className="font-bold uppercase text-gray-500 pt-2">
                Notes:
              </div>
              <p>{notes}</p>
            </>
          )}
        </div>

        {signature && (
          <div className="text-center space-y-3 min-w-48">
            <div className="text-[11px] font-bold text-gray-800">
              For {companyProfile.companyName}
            </div>
            <div className="h-14 flex items-center justify-center">
              {companyProfile.digitalSignatureUrl ? (
                <img
                  src={companyProfile.digitalSignatureUrl}
                  alt="Digital Signature"
                  className="h-14 max-w-56 object-contain"
                />
              ) : (
                <span className="text-gray-300 font-serif italic text-xs">
                  [Authorized Signatory]
                </span>
              )}
            </div>
            <div className="text-[10px] text-gray-500 border-t border-gray-200 pt-1">
              Authorized Signatory
            </div>
          </div>
        )}
      </div>
    </div>
  );
};