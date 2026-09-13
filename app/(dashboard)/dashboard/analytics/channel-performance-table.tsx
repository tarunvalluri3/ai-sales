import { Fragment } from "react";
import { channelLabel } from "@/lib/conversation-channel";
import { InlineEmptyState } from "../_components/state-views";
import { Radio } from "lucide-react";
import type { ChannelPerformance } from "@/lib/analytics";

export function ChannelPerformanceTable({ channels }: { channels: ChannelPerformance[] }) {
  if (channels.length === 0) {
    return <InlineEmptyState icon={Radio} label="No channel activity yet." />;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 gap-y-2 text-xs">
        <span className="text-2xs font-semibold tracking-wide-ds text-ds-text-secondary uppercase">Channel</span>
        <span className="text-right text-2xs font-semibold tracking-wide-ds text-ds-text-secondary uppercase">Conversations</span>
        <span className="text-right text-2xs font-semibold tracking-wide-ds text-ds-text-secondary uppercase">Leads</span>
        <span className="text-right text-2xs font-semibold tracking-wide-ds text-ds-text-secondary uppercase">Appointments</span>
        <span className="text-right text-2xs font-semibold tracking-wide-ds text-ds-text-secondary uppercase">Conversion</span>

        {channels.map((channel) => (
          <Fragment key={channel.channel}>
            <span className="text-ds-text-primary">{channelLabel(channel.channel)}</span>
            <span className="text-right text-ds-text-secondary">{channel.conversations}</span>
            <span className="text-right text-ds-text-secondary">{channel.leads}</span>
            <span className="text-right text-ds-text-secondary">
              {channel.appointments} <span className="text-2xs text-ds-text-muted">({channel.completedAppointments} done)</span>
            </span>
            <span className="text-right font-medium text-ds-text-primary">{channel.conversionRate}%</span>
          </Fragment>
        ))}
      </div>
    </div>
  );
}
