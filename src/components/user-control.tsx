'use client'
import {UserButton} from '@clerk/nextjs'
import {dark} from '@clerk/themes'
import { useCurrentTheme } from '@/hooks/use-current-theme';

interface Props {
    showName?:boolean;
}

export const UserControl=({showName}:Props)=>{
const currentTheme = useCurrentTheme()

    return(
        <UserButton
            showName={showName}
            appearance={{
                elements:{
                    UserButtonBox:"rounded-md!",
                    UserButtonAvatarBox:"rounded-md! size-8!",
                    UserButtonTrigger:"rounded-md!",
                },
                baseTheme:currentTheme === 'dark' ? dark : undefined,
            }}
        />
    )
}
