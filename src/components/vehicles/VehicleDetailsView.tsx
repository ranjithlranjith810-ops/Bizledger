"use client";

import React, { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import {
  Truck,
  ArrowLeft,
  Fuel,
  Wrench,
  Receipt,
  FileCheck,
  Shield,
  User,
  Plus,
  TrendingUp,
  Clock,
  CheckCircle2,
} from "lucide-react";

export const VehicleDetailsView: React.FC = () => {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const {
    selectedVehicleId,
    setSelectedVehicleId,
    vehicles,
    vehicleExpenses,
    setOpenModal,
  } = useApp();

  const vehicleId = typeof params?.id === "string" ? params.id : null;

  useEffect(() => {
    if (vehicleId && vehicleId !== selectedVehicleId) {
      setSelectedVehicleId(vehicleId);
    }
  }, [vehicleId, selectedVehicleId, setSelectedVehicleId]);

  const vehicle = vehicles.find((v) => v.id === vehicleId) || vehicles[0];

  const expensesForVehicle = vehicleExpenses.filter((ve) => ve.vehicleId === vehicle.id);

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Top Breadcrumb & Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/vehicles")}
            className="p-2 bg-white border border-[#eceef0] hover:bg-gray-100 text-gray-600 rounded-xl transition-colors shadow-xs"
            title="Back to Vehicles List"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-bold text-[#191c1e] font-mono tracking-tight">
                {vehicle.registrationNumber}
              </h2>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {vehicle.status}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {vehicle.makeModel} • {vehicle.manufacturingYear} • {vehicle.vehicleType}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setOpenModal("add-vehicle-expense")}
            className="flex items-center gap-1.5 bg-[#93000b] hover:bg-[#770008] text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add Vehicle Expense</span>
          </button>
        </div>
      </div>

      {/* 4 Expense Breakdown Metric Cards (Stitch Design #9) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-[#eceef0] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Total Fuel Expense</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
              <Fuel className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold text-[#191c1e] font-mono">
              ₹{vehicle.fuelExpenses.toLocaleString("en-IN")}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-amber-700 font-medium">
            54% of vehicle outlays
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#eceef0] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Maintenance & Spares</span>
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-700 flex items-center justify-center">
              <Wrench className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold text-[#191c1e] font-mono">
              ₹{vehicle.maintenanceExpenses.toLocaleString("en-IN")}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-gray-500">
            Last service: {vehicle.lastServiceDate || "28 Jul 2026"}
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#eceef0] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">FASTag Toll Passes</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold text-[#191c1e] font-mono">
              ₹{vehicle.tollExpenses.toLocaleString("en-IN")}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-blue-700 font-medium">
            Auto-debit active
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#eceef0] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Total Vehicle Spend</span>
            <div className="w-8 h-8 rounded-lg bg-[#fef2f2] text-[#93000b] flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold text-[#93000b] font-mono">
              ₹{vehicle.totalExpenses.toLocaleString("en-IN")}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-gray-500">
            Odometer: {vehicle.currentOdometer.toLocaleString("en-IN")} km
          </div>
        </div>
      </div>

      {/* Vehicle Info & Driver Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Vehicle Specs */}
        <div className="bg-white p-5 rounded-xl border border-[#eceef0] shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold text-gray-700 uppercase tracking-wider">
            <Truck className="w-4 h-4 text-[#93000b]" />
            <span>Vehicle Specifications</span>
          </div>

          <div className="space-y-3 text-xs divide-y divide-gray-100">
            <div className="flex justify-between py-1.5">
              <span className="text-gray-500">Registration Number</span>
              <span className="font-mono font-bold text-gray-900">{vehicle.registrationNumber}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-gray-500">Make & Model</span>
              <span className="font-semibold text-gray-900">{vehicle.makeModel}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-gray-500">Vehicle Type</span>
              <span className="font-semibold text-gray-900">{vehicle.vehicleType}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-gray-500">Fuel Type</span>
              <span className="font-semibold text-gray-900">{vehicle.fuelType} BS6</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-gray-500">Manufacturing Year</span>
              <span className="font-semibold text-gray-900">{vehicle.manufacturingYear}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-gray-500">Chassis Number</span>
              <span className="font-mono text-gray-700">{vehicle.chassisNumber || "MAT612345N1234567"}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-gray-500">Engine Number</span>
              <span className="font-mono text-gray-700">{vehicle.engineNumber || "275ID05XY98124"}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-gray-500">Assigned Transit Route</span>
              <span className="font-medium text-gray-800 text-right">{vehicle.assignedRoute || "Coimbatore & Tiruppur Hub"}</span>
            </div>
          </div>
        </div>

        {/* Assigned Driver Profile */}
        <div className="bg-white p-5 rounded-xl border border-[#eceef0] shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold text-gray-700 uppercase tracking-wider">
            <User className="w-4 h-4 text-[#93000b]" />
            <span>Assigned Driver Details</span>
          </div>

          <div className="flex items-center gap-3 p-3 bg-[#f7f9fb] rounded-xl border border-[#eceef0]">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-[#93000b] flex items-center justify-center font-bold text-sm">
              {vehicle.driverName.split(" ").map((n) => n[0]).join("")}
            </div>
            <div>
              <div className="font-bold text-gray-900 text-sm">{vehicle.driverName}</div>
              <div className="text-xs text-gray-500">Designated Heavy Driver</div>
              <div className="text-xs text-emerald-700 font-medium flex items-center gap-1 mt-0.5">
                <CheckCircle2 className="w-3 h-3" />
                <span>Verified License & KYC</span>
              </div>
            </div>
          </div>

          <div className="space-y-3 text-xs divide-y divide-gray-100">
            <div className="flex justify-between py-1.5">
              <span className="text-gray-500">Mobile Contact</span>
              <span className="font-mono font-bold text-gray-900">{vehicle.driverPhone}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-gray-500">Driving License No</span>
              <span className="font-mono font-medium text-gray-800">{vehicle.driverLicense}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-gray-500">License Validity</span>
              <span className="font-semibold text-emerald-700">Valid till {vehicle.driverLicenseExpiry}</span>
            </div>
          </div>
        </div>

        {/* Compliance & Expiry Badges */}
        <div className="bg-white p-5 rounded-xl border border-[#eceef0] shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold text-gray-700 uppercase tracking-wider">
            <FileCheck className="w-4 h-4 text-[#93000b]" />
            <span>Statutory Compliance & Expiry</span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl">
              <div className="flex items-center justify-between font-semibold text-emerald-900">
                <span className="flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-emerald-700" />
                  Commercial Insurance
                </span>
                <span className="text-[10px] uppercase bg-emerald-200/60 text-emerald-900 px-1.5 py-0.5 rounded font-bold">
                  Active
                </span>
              </div>
              <div className="text-[11px] text-emerald-800 font-mono mt-1">
                Pol: {vehicle.insurancePolicyNumber}
              </div>
              <div className="text-[11px] text-emerald-700 mt-0.5">
                Expires on: <span className="font-bold">{vehicle.insuranceExpiry}</span>
              </div>
            </div>

            <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl">
              <div className="flex items-center justify-between font-semibold text-blue-900">
                <span className="flex items-center gap-1.5">
                  <FileCheck className="w-3.5 h-3.5 text-blue-700" />
                  Fitness Certificate (FC)
                </span>
                <span className="text-[10px] uppercase bg-blue-200/60 text-blue-900 px-1.5 py-0.5 rounded font-bold">
                  Passed
                </span>
              </div>
              <div className="text-[11px] text-blue-700 mt-1">
                RTO Renewal Due: <span className="font-bold">{vehicle.fcExpiry}</span>
              </div>
            </div>

            <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl">
              <div className="flex items-center justify-between font-semibold text-amber-900">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-700" />
                  Pollution Test (PUC)
                </span>
                <span className="text-[10px] uppercase bg-amber-200/60 text-amber-900 px-1.5 py-0.5 rounded font-bold">
                  Due Soon
                </span>
              </div>
              <div className="text-[11px] text-amber-800 mt-1">
                Expires on: <span className="font-bold">{vehicle.pucExpiry}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Vehicle Expenses Table */}
      <div className="bg-white rounded-xl border border-[#eceef0] shadow-xs overflow-hidden">
        <div className="p-4 border-b border-[#eceef0] flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-[#191c1e]">Recent Vehicle Expense Logs</h3>
            <p className="text-xs text-gray-500">Fuel top-ups, tyre changes, FASTag debits, and mechanical repairs</p>
          </div>
          <button
            onClick={() => setOpenModal("add-vehicle-expense")}
            className="text-xs text-[#93000b] hover:underline font-semibold flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Expense Log
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#f7f9fb] border-b border-[#eceef0] text-gray-500 uppercase tracking-wider text-[11px] font-semibold">
              <tr>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Odometer (km)</th>
                <th className="py-3 px-4">Description / Vendor</th>
                <th className="py-3 px-4">Fuel Details</th>
                <th className="py-3 px-4 text-right">Amount (₹)</th>
                <th className="py-3 px-4">Payment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eceef0]">
              {expensesForVehicle.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-400">
                    <Fuel className="w-6 h-6 mx-auto mb-1.5 text-gray-300" />
                    No expense logs recorded for this vehicle yet.
                  </td>
                </tr>
              ) : (
                expensesForVehicle.map((log) => (
                  <tr key={log.id} className="hover:bg-[#f7f9fb] transition-colors">
                    <td className="py-3 px-4 text-gray-700 whitespace-nowrap">{log.date}</td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-gray-100 text-gray-800">
                        {log.category}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-gray-700">{log.odometerReading} km</td>
                    <td className="py-3 px-4 max-w-xs">
                      <div className="font-semibold text-gray-900 truncate">{log.vendor}</div>
                      <div className="text-[11px] text-gray-500 truncate">{log.notes || "—"}</div>
                    </td>
                    <td className="py-3 px-4 text-gray-600">
                      {log.fuelLitres ? (
                        <span>
                          {log.fuelLitres} L @ ₹{log.fuelRate}/L
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-gray-900">
                      ₹{log.amount.toLocaleString("en-IN")}
                    </td>
                    <td className="py-3 px-4 text-gray-600 whitespace-nowrap">{log.paymentMethod}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
