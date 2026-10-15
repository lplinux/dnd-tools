/**
 * pages/ManageCampaigns/tabs/JournalTab.jsx
 *
 * The campaign journal, from the DM's side. Same panel the players use on
 * their sheets — the DM simply sees the DM-only entries too, and can delete
 * anyone's.
 *
 * It belongs here as well as on the PC Sheet because this is the module a DM
 * runs a campaign from: the locations an entry can point at are managed two
 * tabs away, and staging a document for the party to find later is campaign
 * prep, not character work.
 */
import JournalPanel from '@/pages/Journal/JournalPanel';

export default function JournalTab({ campaignId, calendarType, campaignName }) {
  return (
    <JournalPanel
      key={campaignId}
      campaignId={campaignId}
      isDM
      calendarType={calendarType}
      campaignName={campaignName}
    />
  );
}
