"use client";

import React, { useState } from "react";
import { useApp } from "@/context/AppContext";
import { VehicleType, VehicleStatus } from "@/types";
import { X, Truck, User, ShieldCheck, Check } from "lucide-react";

export const AddVehicleModal: React.FC = () => {
  const { addVehicle, setOpenModal } = useApp();

  const [registrationNumber, setRegistrationNumber] = useState("TN 38 JK 7890");
  const [makeModel, setMakeModel] = useState("Tata Ace Gold Diesel");
  const [vehicleType, setVehicleType] = useState<VehicleType>("Mini Truck");
  const [fuelType, setFuelType] = useState<"Diesel" | "Petrol" | "CNG" | "Electric">("Diesel");
  const [manufacturingYear, setManufacturingYear] = useState("2024");
  const [chassisNumber] = useState("MAT612999P445566");
  const [engineNumber] = useState("275ID09AB1122");
  const [assignedRoute, setAssignedRoute] = useState("Pollachi & Udumalpet Delivery Line");

  const [driverName, setDriverName] = useState("Gopalakrishnan M.");
  const [driverPhone, setDriverPhone] = useState("+91 98433 77889");
  const [driverLicense, setDriverLicense] = useState("TN3820190008899");
  const [driverLicenseExpiry, setDriverLicenseExpiry] = useState("2029-08-30");

  const [insurancePolicyNumber, setInsurancePolicyNumber] = useState("ROYAL-SUND-554411");
  const [insuranceExpiry, setInsuranceExpiry] = useState("2027-08-15");
  const [fcExpiry, setFcExpiry] = useState("2029-08-15");
  const [pucExpiry, setPucExpiry] = useState("2027-02-10");
  const [currentOdometer, setCurrentOdometer] = useState("8500");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!registrationNumber.trim() || !makeModel.trim()) return;

    addVehicle({
      registrationNumber: registrationNumber.toUpperCase(),
      makeModel,
      vehicleType,
      fuelType,
      manufacturingYear: parseInt(manufacturingYear) || 2024,
      chassisNumber,
      engineNumber,
      driverName,
      driverPhone,
      driverLicense,
      driverLicenseExpiry,
      insurancePolicyNumber,
      insuranceExpiry,
      fcExpiry,
      pucExpiry,
      currentOdometer: parseInt(currentOdometer) || 0,
      status: "Active" as VehicleStatus,
      assignedRoute,
      lastServiceDate: new Date().toISOString().split("T")[0],
    });

    setOpenModal(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-[#eceef0] animate-in fade-in zoom-in-95">
        <div className="px-6 py-4 border-b border-[#eceef0] flex items-center justify-between bg-[#f7f9fb]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#fef2f2] text-[#93000b] flex items-center justify-center">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#191c1e]">Register Fleet Vehicle</h3>
              <p className="text-xs text-gray-500">Add commercial truck, driver credentials, and RTO compliance dates</p>
            </div>
          </div>
          <button
            onClick={() => setOpenModal(null)}
            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="bg-[#f7f9fb] p-4 rounded-xl border border-[#eceef0] space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold text-[#191c1e] uppercase tracking-wider">
              <Truck className="w-4 h-4 text-[#93000b]" />
              <span>1. Vehicle Specifications</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Registration Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={registrationNumber}
                  onChange={(e) => setRegistrationNumber(e.target.value)}
                  placeholder="e.g. TN 38 AB 1234"
                  className="w-full py-2 px-3 text-xs bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none font-mono font-bold uppercase"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Make & Model <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={makeModel}
                  onChange={(e) => setMakeModel(e.target.value)}
                  placeholder="e.g. Tata Ace Gold 0.7L BS6"
                  className="w-full py-2 px-3 text-xs bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Vehicle Type
                </label>
                <select
                  value={vehicleType}
                  onChange={(e) => setVehicleType(e.target.value as VehicleType)}
                  className="w-full text-xs bg-white border border-[#eceef0] focus:border-[#93000b] py-2 px-3 rounded-lg outline-none font-medium"
                >
                  <option value="Mini Truck">Mini Truck (e.g. Tata Ace, Dost)</option>
                  <option value="Truck">Heavy Commercial Truck (Eicher, BharatBenz)</option>
                  <option value="Pickup">Pickup Truck (Bolero Maxi, Isuzu)</option>
                  <option value="Van">Cargo Delivery Van</option>
                  <option value="Car">Company Fleet Car</option>
                  <option value="Two-Wheeler">Two-Wheeler / Courier Bike</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Fuel Type
                </label>
                <select
                  value={fuelType}
                  onChange={(e) => setFuelType(e.target.value as "Diesel" | "Petrol" | "CNG" | "Electric")}
                  className="w-full text-xs bg-white border border-[#eceef0] focus:border-[#93000b] py-2 px-3 rounded-lg outline-none font-medium"
                >
                  <option value="Diesel">Diesel</option>
                  <option value="Petrol">Petrol</option>
                  <option value="CNG">CNG</option>
                  <option value="Electric">Electric (EV)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Manufacturing Year
                </label>
                <input
                  type="number"
                  value={manufacturingYear}
                  onChange={(e) => setManufacturingYear(e.target.value)}
                  className="w-full py-2 px-3 text-xs bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Starting Odometer (km)
                </label>
                <input
                  type="number"
                  value={currentOdometer}
                  onChange={(e) => setCurrentOdometer(e.target.value)}
                  className="w-full py-2 px-3 text-xs bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none font-mono"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Assigned Delivery Route / Sector
                </label>
                <input
                  type="text"
                  value={assignedRoute}
                  onChange={(e) => setAssignedRoute(e.target.value)}
                  placeholder="e.g. Coimbatore City & Tiruppur Delivery Line"
                  className="w-full py-2 px-3 text-xs bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none"
                />
              </div>
            </div>
          </div>

          <div className="bg-[#f7f9fb] p-4 rounded-xl border border-[#eceef0] space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold text-[#191c1e] uppercase tracking-wider">
              <User className="w-4 h-4 text-[#93000b]" />
              <span>2. Designated Driver Details</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Driver Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  placeholder="e.g. Ramesh Kumar"
                  className="w-full py-2 px-3 text-xs bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Driver Mobile Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={driverPhone}
                  onChange={(e) => setDriverPhone(e.target.value)}
                  placeholder="e.g. +91 98421 98765"
                  className="w-full py-2 px-3 text-xs bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Commercial Driving License No.
                </label>
                <input
                  type="text"
                  value={driverLicense}
                  onChange={(e) => setDriverLicense(e.target.value)}
                  placeholder="e.g. TN3820150009821"
                  className="w-full py-2 px-3 text-xs bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none font-mono uppercase"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  License Expiry Date
                </label>
                <input
                  type="date"
                  value={driverLicenseExpiry}
                  onChange={(e) => setDriverLicenseExpiry(e.target.value)}
                  className="w-full py-2 px-3 text-xs bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none"
                />
              </div>
            </div>
          </div>

          <div className="bg-[#f7f9fb] p-4 rounded-xl border border-[#eceef0] space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold text-[#191c1e] uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4 text-[#93000b]" />
              <span>3. Insurance, Fitness (FC) & PUC Compliance</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Insurance Policy No.
                </label>
                <input
                  type="text"
                  value={insurancePolicyNumber}
                  onChange={(e) => setInsurancePolicyNumber(e.target.value)}
                  placeholder="e.g. NEW-IND-77890124"
                  className="w-full py-2 px-3 text-xs bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Insurance Expiry Date
                </label>
                <input
                  type="date"
                  value={insuranceExpiry}
                  onChange={(e) => setInsuranceExpiry(e.target.value)}
                  className="w-full py-2 px-3 text-xs bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Fitness Certificate (FC) Expiry
                </label>
                <input
                  type="date"
                  value={fcExpiry}
                  onChange={(e) => setFcExpiry(e.target.value)}
                  className="w-full py-2 px-3 text-xs bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Pollution Under Control (PUC) Expiry
                </label>
                <input
                  type="date"
                  value={pucExpiry}
                  onChange={(e) => setPucExpiry(e.target.value)}
                  className="w-full py-2 px-3 text-xs bg-white border border-[#eceef0] focus:border-[#93000b] rounded-lg outline-none"
                />
              </div>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setOpenModal(null)}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 px-5 rounded-xl text-xs font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-[#93000b] hover:bg-[#770008] text-white py-2.5 px-6 rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              <span>Register Vehicle</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
