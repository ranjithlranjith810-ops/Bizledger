"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { matchesSearch } from "@/lib/search";
import {
  Truck,
  Plus,
  Search,
  Eye,
  Wrench,
  Fuel,
  CheckCircle2,
  User,
  Gauge,
  Receipt,
  TrendingUp,
} from "lucide-react";

// Month-to-date window, computed once at module scope. Kept outside the render
// path so memoized metric computations stay pure (no impure Date.now() calls).
const MTD_START_MS = (() => {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
})();
const MTD_END_MS = Date.now();

export const VehiclesList: React.FC = () => {
  const { vehicles, vehicleExpenses, setSelectedVehicleId, setOpenModal } = useApp();
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [typeFilter, setTypeFilter] = useState<string>("All");

  const filteredVehicles = useMemo(() => {
    return vehicles.filter((v) => {
      const matchesQuery = matchesSearch(searchQuery, [
        v.registrationNumber,
        v.makeModel,
        v.driverName,
        v.assignedRoute,
      ]);

      const matchesStatus = statusFilter === "All" || v.status === statusFilter;
      const matchesType = typeFilter === "All" || v.vehicleType === typeFilter;

      return matchesQuery && matchesStatus && matchesType;
    });
  }, [vehicles, searchQuery, statusFilter, typeFilter]);

  // All fleet metrics below are computed from real vehicle records — no static/seed values.
  const totalVehiclesCount = vehicles.length;
  const activeCount = vehicles.filter((v) => v.status === "Active").length;
  const maintenanceCount = vehicles.filter((v) => v.status === "Under Maintenance").length;
  const totalSpendSum = vehicles.reduce((acc, c) => acc + c.totalExpenses, 0);

  // Fleet spend for the current calendar month, plus fuel efficiency derived from
  // recorded odometer readings — only shown when there is actual fuel data.
  // The month window is computed once at module scope (not during render) so the
  // memo remains pure.
  const vehicleExpensesMtd = useMemo(() => {
    return vehicleExpenses
      .filter((ve) => {
        const d = new Date(ve.date).getTime();
        return d >= MTD_START_MS && d <= MTD_END_MS;
      })
      .reduce((s, ve) => s + (ve.amount || 0), 0);
  }, [vehicleExpenses]);

  const fuelMetrics = useMemo(() => {
    let spend = 0;
    let litres = 0;
    vehicleExpenses.forEach((ve) => {
      if (ve.category === "Fuel") {
        spend += ve.amount || 0;
        litres += ve.fuelLitres || 0;
      }
    });
    const rate = litres > 0 ? spend / litres : 0;
    return { spend, litres, rate };
  }, [vehicleExpenses]);

  const activePct =
    totalVehiclesCount > 0 ? Math.round((activeCount / totalVehiclesCount) * 100) : 0;

  const handleSelectVehicle = (vehicleId: string) => {
    setSelectedVehicleId(vehicleId);
    router.push(`/vehicles/${vehicleId}`);
  };

  const inr = (n: number): string =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(n);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#191c1e] tracking-tight">
            Fleet & Vehicle Management
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Track commercial trucks, drivers, diesel efficiency, FASTag toll, and service schedules.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setOpenModal("add-vehicle-expense")}
            className="flex items-center gap-1.5 bg-white border border-[#eceef0] hover:bg-gray-50 text-gray-700 px-3.5 py-2 rounded-lg text-xs font-semibold shadow-xs transition-colors"
          >
            <Receipt className="w-4 h-4 text-amber-600" />
            <span>Log Fuel / Service</span>
          </button>
          <button
            id="btn-add-vehicle"
            onClick={() => setOpenModal("add-vehicle")}
            className="flex items-center gap-1.5 bg-[#93000b] hover:bg-[#770008] text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Register Vehicle</span>
          </button>
        </div>
      </div>

      {/* Metric Cards (Stitch Design #5) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-[#eceef0] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Total Fleet Vehicles</span>
            <div className="w-8 h-8 rounded-lg bg-[#fef2f2] text-[#93000b] flex items-center justify-center">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-[#191c1e] font-mono">
              {totalVehiclesCount}
            </span>
            <span className="text-xs text-gray-500">units registered</span>
          </div>
          <div className="mt-2 text-[11px] text-gray-500">
            {vehicles.length === 0
              ? "No vehicles registered yet"
              : `${new Set(vehicles.map((v) => v.vehicleType)).size} vehicle type(s) in fleet`}
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#eceef0] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Active on Road</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-700 font-mono">
              {activeCount}
            </span>
            <span className="text-xs text-emerald-600 font-medium">({activePct}%)</span>
          </div>
          <div className="mt-2 text-[11px] text-emerald-700 font-medium flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            <span>
              {activeCount === 0
                ? "No vehicles on the road"
                : activeCount === totalVehiclesCount
                ? "Entire fleet is active"
                : `${activeCount} of ${totalVehiclesCount} on the road`}
            </span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#eceef0] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Under Maintenance</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
              <Wrench className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-amber-700 font-mono">
              {maintenanceCount}
            </span>
            <span className="text-xs text-amber-600">
              {maintenanceCount === 0 ? "none in bay" : "in authorized bay"}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-amber-700 font-medium">
            {maintenanceCount === 0
              ? "No vehicles under service"
              : `${maintenanceCount} vehicle(s) logged for service`}
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#eceef0] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Fleet Expenses (MTD)</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
              <Fuel className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold text-[#191c1e] font-mono">
              {inr(vehicleExpensesMtd)}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-600 font-medium">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>
              {fuelMetrics.litres > 0
                ? `Avg fuel: ${fuelMetrics.rate.toFixed(2)} / L (${fuelMetrics.litres.toFixed(0)} L)`
                : "Log fuel to see efficiency"}
            </span>
          </div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-white p-4 rounded-xl border border-[#eceef0] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search vehicle number (e.g. TN 38), model, driver..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs bg-[#f2f4f6] border border-transparent focus:border-[#93000b] focus:bg-white rounded-lg outline-none transition-all"
          />
        </div>

        <div className="flex items-center gap-2 text-xs">
          <div className="flex items-center gap-1 bg-[#f2f4f6] p-1 rounded-lg">
            {["All", "Active", "Under Maintenance"].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                  statusFilter === st
                    ? "bg-white text-[#93000b] shadow-xs font-semibold"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="text-xs bg-[#f2f4f6] border border-transparent focus:border-[#93000b] py-2 px-3 rounded-lg outline-none font-medium text-gray-700"
          >
            <option value="All">All Types</option>
            <option value="Mini Truck">Mini Truck</option>
            <option value="Truck">Heavy Truck</option>
            <option value="Pickup">Pickup Truck</option>
            <option value="Van">Delivery Van</option>
          </select>
        </div>
      </div>

      {/* Vehicles Table (Stitch Design #5) */}
      <div className="bg-white rounded-xl border border-[#eceef0] shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#f7f9fb] border-b border-[#eceef0] text-gray-500 uppercase tracking-wider text-[11px] font-semibold">
              <tr>
                <th className="py-3 px-4">Vehicle Reg. No</th>
                <th className="py-3 px-4">Make & Model</th>
                <th className="py-3 px-4">Type / Fuel</th>
                <th className="py-3 px-4">Assigned Driver</th>
                <th className="py-3 px-4">Odometer</th>
                <th className="py-3 px-4 text-right">Total Spend (₹)</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eceef0]">
              {filteredVehicles.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-gray-400">
                    <Truck className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <p className="font-medium">No vehicles matching filter</p>
                  </td>
                </tr>
              ) : (
                filteredVehicles.map((veh) => (
                  <tr
                    key={veh.id}
                    onClick={() => handleSelectVehicle(veh.id)}
                    className="hover:bg-[#f7f9fb] transition-colors cursor-pointer group"
                  >
                    <td className="py-3.5 px-4 font-mono font-bold text-gray-900 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-md bg-rose-50 text-[#93000b] flex items-center justify-center font-semibold text-xs border border-rose-100">
                          TN
                        </div>
                        <span className="group-hover:text-[#93000b] transition-colors">
                          {veh.registrationNumber}
                        </span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 font-semibold text-gray-800">
                      <div>{veh.makeModel}</div>
                      <div className="text-[11px] text-gray-400 font-normal">
                        Year: {veh.manufacturingYear}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-gray-600 whitespace-nowrap">
                      <div className="font-medium">{veh.vehicleType}</div>
                      <div className="text-[10px] text-gray-400">{veh.fuelType} Engine</div>
                    </td>

                    <td className="py-3.5 px-4 max-w-xs">
                      <div className="font-semibold text-gray-900 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-gray-400" />
                        {veh.driverName}
                      </div>
                      <div className="text-[11px] text-gray-500 font-mono">
                        {veh.driverPhone}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 font-mono font-medium text-gray-700 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Gauge className="w-3.5 h-3.5 text-gray-400" />
                        <span>{veh.currentOdometer.toLocaleString("en-IN")} km</span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-right font-mono font-bold text-gray-900 text-sm whitespace-nowrap">
                      ₹{veh.totalExpenses.toLocaleString("en-IN")}
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {veh.status === "Active" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                          Under Maintenance
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectVehicle(veh.id);
                          }}
                          className="px-2.5 py-1 bg-white border border-[#eceef0] hover:bg-[#fef2f2] hover:text-[#93000b] text-gray-700 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View Profile</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-[#f7f9fb] px-4 py-3 border-t border-[#eceef0] flex items-center justify-between text-xs text-gray-500">
          <div>
            Showing <span className="font-semibold text-gray-800">{filteredVehicles.length}</span> fleet vehicles
          </div>
          <div className="font-medium text-gray-700">
            Total Fleet Expense Logged:{" "}
            <span className="font-bold text-[#191c1e] font-mono">
              ₹{totalSpendSum.toLocaleString("en-IN")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
