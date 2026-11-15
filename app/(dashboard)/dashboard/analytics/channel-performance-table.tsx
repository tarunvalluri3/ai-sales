import { channelLabel } from "@/lib/conversation-channel";
import { InlineEmptyState } from "../_components/state-views";
import { ChannelIcon } from "../_components/ui";
import { Radio } from "lucide-react";
import type { ChannelPerformance } from "@/lib/analytics";

export function ChannelPerformanceTable({ channels }: { channels: ChannelPerformance[] }) {
  if (channels.length === 0) {
    return <InlineEmptyState icon={Radio} label="No channel activity yet." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[26rem] border-separate border-spacing-0 text-left">
        <thead>
          <tr>
            <th scope="col" className="dx-th px-3 py-2">
              Channel
            </th>
            <th scope="col" className="dx-th px-3 py-2">
              Chats
            </th>
            <th scope="col" className="dx-th px-3 py-2">
              Leads
            </th>
            <th scope="col" className="dx-th px-3 py-2">
              Appts
            </th>
            <th scope="col" className="dx-th px-3 py-2">
              Conv.
            </th>
          </tr>
        </thead>
        <tbody className="text-sm text-ds-text-primary">
          {channels.map((channel) => (
            <tr key={channel.channel}>
              <th scope="row" className="border-b border-ds-border px-3 py-2.5 font-medium">
                <span className="flex items-center gap-3">
                  <ChannelIcon source={channel.channel} className="size-5 shrink-0" strokeWidth={1.75} />
                  {channelLabel(channel.channel)}
                </span>
              </th>
              <td className="border-b border-ds-border px-3 py-2.5 tabular-nums">{channel.conversations}</td>
              <td className="border-b border-ds-border px-3 py-2.5 tabular-nums">{channel.leads}</td>
              <td className="border-b border-ds-border px-3 py-2.5 tabular-nums">
                <span className="flex flex-col leading-tight">
                  <span className="font-medium">{channel.appointments}</span>
                  <span className="text-xs text-ds-text-secondary">{channel.completedAppointments} done</span>
                </span>
              </td>
              <td className="border-b border-ds-border px-3 py-2.5 tabular-nums">{channel.conversionRate}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
