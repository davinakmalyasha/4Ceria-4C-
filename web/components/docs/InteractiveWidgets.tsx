'use client';

import BiddingWidget from './widgets/BiddingWidget';
import MilestoneWidget from './widgets/MilestoneWidget';
import RadarWidget from './widgets/RadarWidget';
import PostProjectWidget from './widgets/PostProjectWidget';
import SellHouseWidget from './widgets/SellHouseWidget';
import HireProWidget from './widgets/HireProWidget';
import BuyMaterialWidget from './widgets/BuyMaterialWidget';
import VerificationWidget from './widgets/VerificationWidget';
import ShortlistInterviewWidget from './widgets/ShortlistInterviewWidget';
import ChatWidget from './widgets/ChatWidget';
import ContractWidget from './widgets/ContractWidget';
import PhaseTimelineWidget from './widgets/PhaseTimelineWidget';
import ProjectBoardWidget from './widgets/ProjectBoardWidget';
import FirmSquadWidget from './widgets/FirmSquadWidget';
import CheckoutWidget from './widgets/CheckoutWidget';
import PMScheduleWidget from './widgets/PMScheduleWidget';
import NotificationWidget from './widgets/NotificationWidget';

/**
 * The widget switch.
 *
 * The seventeen widgets are native copies of the legacy simulations (same
 * markup, same classes, same state machines). This switch names them.
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
