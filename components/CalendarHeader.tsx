
import React from "react";

interface CalendarHeaderProps {
  currentDate: Date;
  viewMode: "week" | "day";
  onDateChange: (date: Date) => void;
  onViewModeChange: (mode: "week" | "day") => void;
}

export default function CalendarHeader({ currentDate, viewMode, onDateChange, onViewModeChange }: CalendarHeaderProps) {
  const handlePrev = () => {
    const newDate = new Date(currentDate);
    if (viewMode === "week") {
      newDate.setDate(newDate.getDate() - 7);
    } else {
      newDate.setDate(newDate.getDate() - 1);
    }
    onDateChange(newDate);
  };

  const handleNext = () => {
    const newDate = new Date(currentDate);
    if (viewMode === "week") {
      newDate.setDate(newDate.getDate() + 7);
    } else {
      newDate.setDate(newDate.getDate() + 1);
    }
    onDateChange(newDate);
  };

  const handleToday = () => {
    onDateChange(new Date());
  };

  const handleDateInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value) {
      onDateChange(new Date(e.target.value));
    }
  };

  const formatDate = (date: Date) => {
    return date.toISOString().split("T")[0];
  };

  return (
    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="flex bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => onViewModeChange("week")}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              viewMode === "week" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Week
          </button>
          <button
            onClick={() => onViewModeChange("day")}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              viewMode === "day" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Day
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 w-full md:w-auto">
        <button onClick={handlePrev} className="p-2 hover:bg-gray-100 rounded-lg text-gray-600 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        
        <button 
          onClick={handleToday}
          className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg border border-gray-200"
        >
          Today
        </button>

        <input
          type="date"
          value={formatDate(currentDate)}
          onChange={handleDateInput}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />

        <button onClick={handleNext} className="p-2 hover:bg-gray-100 rounded-lg text-gray-600 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
