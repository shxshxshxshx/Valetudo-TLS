import React from "react";
import {Avatar, Box, Divider, IconButton, MenuItem} from "@mui/material";
import {useValetudoUserProfileQuery} from "../api";
import {red} from "@mui/material/colors";
import Menu from "@mui/material/Menu";

function stringToColor(string: string) {
    let hash = 0;
    let i;

    /* eslint-disable no-bitwise */
    for (i = 0; i < string.length; i += 1) {
        hash = string.charCodeAt(i) + ((hash << 5) - hash);
    }

    let color = "#";

    for (i = 0; i < 3; i += 1) {
        const value = (hash >> (i * 8)) & 0xff;
        color += `00${value.toString(16)}`.slice(-2);
    }
    /* eslint-enable no-bitwise */

    return color;
}

function stringAvatar(name: string|undefined) {
    const splitName = name?.split(" ");
    if (typeof splitName === "undefined" || splitName.length === 0) {
        return {
            sx: {
                bgcolor: red[500],
            },
            children: "ERR",
        };
    } else if (splitName.length === 1) {
        return {
            sx: {
                bgcolor: stringToColor(splitName[0]),
            },
            children: `${splitName[0][0]}`,
        };
    } else {
        return {
            sx: {
                bgcolor: stringToColor(splitName[0]),
            },
            children: `${splitName[0][0]}${splitName[1][0]}`,
        };
    }
}

const ValetudoUser = (): React.ReactElement => {

    const {
        data: userProfileData,
        isPending: userProfilePending,
        isError: userProfileError,
    } = useValetudoUserProfileQuery();

    const [anchorElement, setAnchorElement] = React.useState<null | HTMLElement>(null);
    const handleMenu = (event: React.MouseEvent<HTMLElement>) => {
        setAnchorElement(event.currentTarget);
    };
    const handleClose = () => {
        setAnchorElement(null);
    };

    const profile = React.useMemo(() => {
        const icon = <Avatar {...stringAvatar(userProfileData?.name ?? "")}/>;
        if (!userProfilePending) {
            if (userProfileError) {
                return {
                    icon: <Avatar {...stringAvatar(undefined)}/>,
                    name: "Error",
                    email: "Error",
                };
            }
        }
        return {
            icon: icon,
            name: userProfileData?.name ?? "Unknown",
            email: userProfileData?.email ?? "Unknown",
        };
    }, [userProfileData, userProfileError, userProfilePending]);

    return (
        <>
            <IconButton
                size="medium"
                aria-label="Profile"
                onClick={handleMenu}
                color="inherit"
                title="Profile"
            >
                {profile.icon}
            </IconButton>
            <Menu
                open={Boolean(anchorElement)}
                anchorEl={anchorElement}
                onClose={handleClose}
            >

                <MenuItem sx={{gap: "1rem"}}>{profile.icon}
                    <Box>
                        {profile.name}<br/>
                        {profile.email}
                    </Box>
                </MenuItem>
                <Divider/>
                <MenuItem component={"a"} href={"/logout"}>Logout</MenuItem>
            </Menu>
        </>
    );
};

export default ValetudoUser;
