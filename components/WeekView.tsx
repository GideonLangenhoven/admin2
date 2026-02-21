
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

interface WeekViewProps {
    slots: Slot[];
    currentDate: Date;
    onToggleSlot: (id: string, currentStatus: string) => void;
}

export default function WeekView({ slots, currentDate, onToggleSlot }: WeekViewProps) {
    const startOfWeek = new Date(currentDate);
    const dayOfWeek = startOfWeek.getDay();
    // Adjust to start on Monday (0 = Mon, 6 = Sun)
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    startOfWeek.setDate(startOfWeek.getDate() + diff);
    startOfWeek.setHours(0, 0, 0, 0);

    const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(startOfWeek);
        d.setDate(d.getDate() + i);
        return d;
    });

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

    const fmtTime = (iso: string) => {
        return new Date(iso).toLocaleTimeString("en-ZA", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Africa/Johannesburg",
        });
    };

    return (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
            <div className="min-w-[800px] grid grid-cols-7 divide-x divide-gray-200 bg-white">
                {days.map((day) => (
                    <div key={day.toISOString()} className="flex flex-col">
                        <div className={`p-3 text-center border-b border-gray-200 ${day.toDateString() === new Date().toDateString() ? "bg-blue-50" : "bg-gray-50"
                            }`}>
                            <div className="text-xs font-medium text-gray-500 uppercase">
                                {day.toLocaleDateString("en-US", { weekday: "short" })}
                            </div>
                            <div className={`text-sm font-semibold mt-1 rounded-full w-8 h-8 flex items-center justify-center mx-auto ${day.toDateString() === new Date().toDateString() ? "bg-blue-600 text-white" : "text-gray-900"
                                }`}>
                                {day.getDate()}
                            </div>
                        </div>

                        <div className="flex-1 p-2 min-h-[300px] space-y-2 bg-white">
                            {getSlotsForDay(day).map((slot) => {
                                const avail = slot.capacity_total - slot.booked - (slot.held || 0);
                                const isClosed = slot.status !== "OPEN";
                                return (
                                    <div
                                        key={slot.id}
                                        onClick={() => onToggleSlot(slot.id, slot.status)}
                                        className={`p-2 rounded-lg border text-xs cursor-pointer transition-colors ${isClosed
                                                ? "bg-red-50 border-red-100 opacity-70"
                                                : avail <= 0
                                                    ? "bg-gray-100 border-gray-200"
                                                    : "bg-blue-50 border-blue-100 hover:border-blue-300"
                                            }`}
                                    >
                                        <div className="flex justify-between items-start mb-1">
                                            <span className="font-bold text-gray-900">{fmtTime(slot.start_time)}</span>
                                            {isClosed && <span className="text-[10px] bg-red-100 text-red-600 px-1 rounded">Closed</span>}
                                        </div>
                                        <div className="font-medium truncate mb-1" title={slot.tours?.name}>{slot.tours?.name}</div>
                                        <div className="flex justify-between text-gray-500">
                                            <span>{slot.booked}/{slot.capacity_total}</span>
                                            <span className={avail > 0 ? "text-green-600 font-bold" : "text-gray-400"}>
                                                {avail} left
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                            {getSlotsForDay(day).length === 0 && (
                                <div className="text-center py-8 text-gray-400 text-xs italic">
                                    No slots
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
