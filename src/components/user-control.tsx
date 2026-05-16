'use client'
import {UserButton} from '@clerk/nextjs'
import {dark} from '@clerk/themes'
import { useCurrentTheme } from '@/hooks/use-current-theme';
import { useState, useEffect } from 'react';

interface Props {
    showName?:boolean;
}

export const UserControl=({showName}:Props)=>{
const currentTheme = useCurrentTheme()
const [isMounted, setIsMounted] = useState(false)

useEffect(() => {
  setIsMounted(true)
}, [])

  if (!isMounted) {
    return <div className="h-8 w-8 rounded-md animate-pulse bg-muted" />
  }

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
