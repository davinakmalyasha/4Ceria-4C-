'use client';

import dynamic from 'next/dynamic';

const BiddingWidget = dynamic(() => import('./widgets/BiddingWidget'), { ssr: false });
const MilestoneWidget = dynamic(() => import('./widgets/MilestoneWidget'), { ssr: false });
const RadarWidget = dynamic(() => import('./widgets/RadarWidget'), { ssr: false });
const PostProjectWidget = dynamic(() => import('./widgets/PostProjectWidget'), { ssr: false });
const HireProWidget = dynamic(() => import('./widgets/HireProWidget'), { ssr: false });
const BuyMaterialWidget = dynamic(() => import('./widgets/BuyMaterialWidget'), { ssr: false });
const VerificationWidget = dynamic(() => import('./widgets/VerificationWidget'), { ssr: false });
const ShortlistInterviewWidget = dynamic(() => import('./widgets/ShortlistInterviewWidget'), { ssr: false });

import SellHouseWidget from './widgets/SellHouseWidget';
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
 * The seventeen widgets are native copies of the previous simulations (same
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
