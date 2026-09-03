"use client";

import React, { useState } from "react";
import { useApp } from "@/context/AppContext";
import { X, Fuel, Check } from "lucide-react";

type VehicleExpenseCategoryOption =
  | "Fuel"
  | "Service & Maintenance"
  | "Fastag / Toll"
  | "Tyre"
  | "Repairs"
  | "Insurance"
  | "Others";

export const AddVehicleExpenseModal: React.FC = () => {
  const { vehicles, selectedVehicleId, addVehicleExpense, setOpenModal } = useApp();

  const [vehicleId, setVehicleId] = useState<string>(selectedVehicleId || vehicles[0]?.id || "");
  const [date, setDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [category, setCategory] = useState<VehicleExpenseCategoryOption>("Fuel");
  const [amount, setAmount] = useState<string>("4500");
  const [odometerReading, setOdometerReading] = useState<string>("48500");
  const [fuelLitres, setFuelLitres] = useState<string>("48.5");
  const [fuelRate, setFuelRate] = useState<string>("92.78");
  const [vendor, setVendor] = useState<string>("HPCL Auto Fuels, Trichy Road");
  const [paymentMethod, setPaymentMethod] = useState<string>("Cash");
  const [referenceNumber, setReferenceNumber] = useState<string>("HPCL-REC-9018");
  const [notes, setNotes] = useState<string>("Full tank refill before Tiruppur dispatch run.");

  const selectedVehicle = vehicles.find((v) => v.id === vehicleId) || vehicles[0];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount) || 0;
    const numOdo = parseInt(odometerReading) || selectedVehicle?.currentOdometer || 0;
    if (!selectedVehicle || numAmount <= 0) return;

    addVehicleExpense({
      vehicleId: selectedVehicle.id,
      vehicleRegistration: selectedVehicle.registrationNumber,
      date,
      category,
      amount: numAmount,
      odometerReading: numOdo,
      fuelLitres: category === "Fuel" ? parseFloat(fuelLitres) : undefined,
      fuelRate: category === "Fuel" ? parseFloat(fuelRate) : undefined,
      vendor: vendor || "Fuel Station / Service Bay",
      paymentMethod,
      referenceNumber,
      notes,
    });

    setOpenModal(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-[#eceef0] animate-in fade-in zoom-in-95">
        <div className="px-6 py-4 border-b border-[#eceef0] flex items-center justify-between bg-[#f7f9fb]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
              <Fuel className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#191c1e]">Add Vehicle Expense</h3>
              <p className="text-xs text-gray-500">Record fuel refills, maintenance work, or FASTag debits</p>
            </div>
          </div>
          <button
            onClick={() => setOpenModal(null)}
            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-gray-700 mb-1">
              Select Fleet Vehicle <span className="text-rose-500">*</span>
            </label>
            <select
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              className="w-full bg-white border border-[#eceef0] focus:border-[#93000b] py-2 px-3 rounded-lg outline-none font-semibold text-gray-900"
            >
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.registrationNumber} — {v.makeModel} (Driver: {v.driverName} • Odo: {v.currentOdometer} km)
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Expense Category <span className="text-rose-500">*</span>
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as VehicleExpenseCategoryOption)}
                className="w-full bg-white border border-[#eceef0] focus:border-[#93000b] py-2 px-3 rounded-lg outline-none font-medium"
              >
                <option value="Fuel">Fuel (Diesel / Petrol / CNG)</option>
                <option value="Service & Maintenance">Service & Periodic Maintenance</option>
                <option value="Fastag / Toll">FASTag / Highway Toll</option>
                <option value="Tyre">Tyres & Wheel Alignment</option>
                <option value="Repairs">Mechanical / Electrical Repairs</option>
                <option value="Insurance">Insurance & Renewal</option>
                <option value="Others">Others / Cleanliness</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Date of Outlay <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full py-2 px-3 bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Amount (₹) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full py-2 px-3 bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none font-mono font-bold text-gray-900"
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Current Odometer (km) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                required
                value={odometerReading}
                onChange={(e) => setOdometerReading(e.target.value)}
                placeholder="e.g. 48500"
                className="w-full py-2 px-3 bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none font-mono"
              />
            </div>
          </div>

          {category === "Fuel" && (
            <div className="bg-amber-50/60 p-3.5 rounded-xl border border-amber-200 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-amber-900 mb-1">
                  Fuel Quantity (Litres)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={fuelLitres}
                  onChange={(e) => setFuelLitres(e.target.value)}
                  className="w-full py-1.5 px-3 bg-white border border-amber-300 rounded-lg outline-none font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-amber-900 mb-1">
                  Fuel Rate (₹ / Litre)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={fuelRate}
                  onChange={(e) => setFuelRate(e.target.value)}
                  className="w-full py-1.5 px-3 bg-white border border-amber-300 rounded-lg outline-none font-mono"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block font-semibold text-gray-700 mb-1">
              Vendor / Service Centre / Fuel Outlet Name
            </label>
            <input
              type="text"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              placeholder="e.g. HPCL Auto Fuels, Trichy Road"
              className="w-full py-2 px-3 bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Payment Method
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full bg-white border border-[#eceef0] focus:border-[#93000b] py-2 px-3 rounded-lg outline-none"
              >
                <option value="Cash">Cash (Driver Handout)</option>
                <option value="UPI">UPI / QR (PhonePe, GPay)</option>
                <option value="Bank Transfer">Bank Transfer (NEFT)</option>
                <option value="Credit Card">Fleet Fuel Card</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Bill / Transaction Ref. No.
              </label>
              <input
                type="text"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="e.g. HPCL-REC-9018"
                className="w-full py-2 px-3 bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-gray-700 mb-1">
              Remarks / Route Details
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add purpose, route destination, or maintenance notes..."
              className="w-full py-2 px-3 bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none resize-none"
            />
          </div>

          <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setOpenModal(null)}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 px-4 rounded-xl font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-[#93000b] hover:bg-[#770008] text-white py-2 px-5 rounded-xl font-bold shadow-xs transition-colors flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              <span>Save Vehicle Expense</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
