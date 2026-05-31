import React from 'react';
import BiddingWidget from './widgets/BiddingWidget';
import MilestoneWidget from './widgets/MilestoneWidget';
import RadarWidget from './widgets/RadarWidget';
import PostProjectWidget from './widgets/PostProjectWidget';
import SellHouseWidget from './widgets/SellHouseWidget';
import HireProWidget from './widgets/HireProWidget';
import BuyMaterialWidget from './widgets/BuyMaterialWidget';
import VerificationWidget from './widgets/VerificationWidget';
import ShortlistInterviewWidget from './widgets/ShortlistInterviewWidget';

interface InteractiveWidgetsProps {
    name: 'bidding' | 'milestone' | 'radar' | 'postproject' | 'sellhouse' | 'hirepro' | 'buymaterial' | 'verification' | 'shortlistinterview';
}

export default function InteractiveWidgets({ name }: InteractiveWidgetsProps) {
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
        default: return null;
    }
}
