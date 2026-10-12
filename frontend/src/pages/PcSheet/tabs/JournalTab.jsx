/**
 * pages/PcSheet/tabs/JournalTab.jsx
 *
 * The campaign's shared journal, on the character sheet because that is where
 * a player already is when they want to write something down.
 *
 * A thin mount, exactly like DiaryTab: the panel owns its own data, so the
 * same component serves the DM's copy in Manage Campaigns without either page
 * having to know about the other.
 */
import JournalPanel from '@/pages/Journal/JournalPanel';

export default function JournalTab({ campaignId, isDM, calendarType }) {
  return (
    <JournalPanel
      key={campaignId}
      campaignId={campaignId}
      isDM={isDM}
      calendarType={calendarType}
    />
  );
}
