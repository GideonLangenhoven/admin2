
import React from "react";

interface Slot {
    id: string;
    start_time: string;
    tours: { name: string };
    status: string;
    capacity_total: number;
    booked: number;
    held: number;
}

interface DayViewProps {
    slots: Slot[];
    currentDate: Date;
    onToggleSlot: (id: string, currentStatus: string) => void;
}

export default function DayView({ slots, currentDate, onToggleSlot }: DayViewProps) {
    const getSlotsForDay = (date: Date) => {
        return slots.filter((slot) => {
            const slotDate = new Date(slot.start_time);
            return (
                slotDate.getDate() === date.getDate() &&
                slotDate.getMonth() === date.getMonth() &&
                slotDate.getFullYear() === date.getFullYear()
            );
        });
    };

    const daySlots = getSlotsForDay(currentDate);

    const fmtTime = (iso: string) => {
        return new Date(iso).toLocaleTimeString("en-ZA", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Africa/Johannesburg",
        });
    };

    return (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                <h3 className="font-semibold text-gray-900">
                    {currentDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                </h3>
                <span className="text-sm text-gray-500">{daySlots.length} slots</span>
            </div>

            {daySlots.length === 0 ? (
                <div className="p-12 text-center text-gray-500 italic">
                    No slots scheduled for this day.
                </div>
            ) : (
                <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="text-left p-3 font-medium text-gray-600">Time</th>
                            <th className="text-left p-3 font-medium text-gray-600">Tour</th>
                            <th className="text-left p-3 font-medium text-gray-600">Capacity</th>
                            <th className="text-left p-3 font-medium text-gray-600">Booked</th>
                            <th className="text-left p-3 font-medium text-gray-600">Held</th>
                            <th className="text-left p-3 font-medium text-gray-600">Available</th>
                            <th className="text-left p-3 font-medium text-gray-600">Status</th>
                            <th className="text-left p-3 font-medium text-gray-600">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {daySlots.map((s) => {
                            const avail = s.capacity_total - s.booked - (s.held || 0);
                            return (
                                <tr key={s.id} className="border-t border-gray-100 hover:bg-gray-50">
                                    <td className="p-3 font-mono">{fmtTime(s.start_time)}</td>
                                    <td className="p-3 font-medium">{s.tours?.name}</td>
                                    <td className="p-3">{s.capacity_total}</td>
                                    <td className="p-3">{s.booked}</td>
                                    <td className="p-3">{s.held || 0}</td>
                                    <td className={`p-3 font-bold ${avail > 0 ? "text-green-600" : "text-gray-400"}`}>{avail}</td>
                                    <td className="p-3">
                                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${s.status === "OPEN" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                                            {s.status}
                                        </span>
                                    </td>
                                    <td className="p-3">
                                        <button
                                            onClick={() => onToggleSlot(s.id, s.status)}
                                            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${s.status === "OPEN"
                                                    ? "bg-red-50 text-red-600 hover:bg-red-100 border border-red-200"
                                                    : "bg-green-50 text-green-600 hover:bg-green-100 border border-green-200"
                                                }`}
                                        >
                                            {s.status === "OPEN" ? "Close Slot" : "Open Slot"}
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            )}
        </div>
    );
}
