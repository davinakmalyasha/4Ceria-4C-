'use client';

import BiddingWidget from '@/content/components/docs/widgets/BiddingWidget';
import MilestoneWidget from '@/content/components/docs/widgets/MilestoneWidget';
import RadarWidget from '@/content/components/docs/widgets/RadarWidget';
import PostProjectWidget from '@/content/components/docs/widgets/PostProjectWidget';
import SellHouseWidget from '@/content/components/docs/widgets/SellHouseWidget';
import HireProWidget from '@/content/components/docs/widgets/HireProWidget';
import BuyMaterialWidget from '@/content/components/docs/widgets/BuyMaterialWidget';
import VerificationWidget from '@/content/components/docs/widgets/VerificationWidget';
import ShortlistInterviewWidget from '@/content/components/docs/widgets/ShortlistInterviewWidget';
import ChatWidget from '@/content/components/docs/widgets/ChatWidget';
import ContractWidget from '@/content/components/docs/widgets/ContractWidget';
import PhaseTimelineWidget from '@/content/components/docs/widgets/PhaseTimelineWidget';
import ProjectBoardWidget from '@/content/components/docs/widgets/ProjectBoardWidget';
import FirmSquadWidget from '@/content/components/docs/widgets/FirmSquadWidget';
import CheckoutWidget from '@/content/components/docs/widgets/CheckoutWidget';
import PMScheduleWidget from '@/content/components/docs/widgets/PMScheduleWidget';
import NotificationWidget from '@/content/components/docs/widgets/NotificationWidget';

/**
 * The widget switch.
 *
 * The seventeen widgets are SYNCED from the legacy source (see
 * `scripts/sync-content.mjs`), so each one is the same simulation with the same
 * classes. This file is the only thing that is ported by hand: a `switch` that
 * names them.
 */
export function InteractiveWidgets({ name }: { name: string }) {
    switch (name) {
        case 'bidding': return <BiddingWidget />;
        case 'milestone': return <MilestoneWidget />;
        case 'radar': return <RadarWidget />;
        case 'postproject': return <PostProjectWidget />;
        case 'sellhouse': return <SellHouseWidget />;
        case 'hirepro': return <HireProWidget />;
        case 'buymaterial': return <BuyMaterialWidget />;
        case 'verification': return <VerificationWidget />;
        case 'shortlistinterview': return <ShortlistInterviewWidget />;
        case 'chat': return <ChatWidget />;
        case 'contract': return <ContractWidget />;
        case 'phasetimeline': return <PhaseTimelineWidget />;
        case 'projectboard': return <ProjectBoardWidget />;
        case 'firmsquad': return <FirmSquadWidget />;
        case 'checkout': return <CheckoutWidget />;
        case 'pmschedule': return <PMScheduleWidget />;
        case 'notification': return <NotificationWidget />;
        default: return null;
    }
}
