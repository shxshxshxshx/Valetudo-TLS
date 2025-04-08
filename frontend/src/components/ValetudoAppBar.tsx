import {
    AppBar,
    Box,
    Divider,
    Drawer,
    IconButton,
    List,
    ListItem,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    ListSubheader,
    PaletteMode,
    Switch,
    Toolbar,
    Typography
} from "@mui/material";
import React from "react";
import {
    AccessTime as TimeIcon,
    Equalizer as StatisticsIcon,
    DarkMode as DarkModeIcon,
    Map as MapManagementIcon,
    Home as HomeIcon,
    Article as LogIcon,
    Menu as MenuIcon,
    ArrowBack as BackIcon,
    PendingActions as PendingActionsIcon,
    Hub as ConnectivityIcon,
    SystemUpdateAlt as UpdaterIcon,
    SettingsRemote as SettingsRemoteIcon,
    GitHub as GithubIcon,
    Favorite as DonateIcon,
    MenuBook as DocsIcon,
    Wysiwyg as SystemInformationIcon,
    Info as AboutIcon,
    Help as HelpIcon,
    SvgIconComponent
} from "@mui/icons-material";
import {Link, useLocation} from "react-router-dom";
import ValetudoEvents from "./ValetudoEvents";
import {Capability, useValetudoUserProfileQuery} from "../api";
import {useCapabilitiesSupported} from "../CapabilitiesProvider";
import {
    RobotMonochromeIcon,
    SwaggerUIIcon,
    ValetudoMonochromeIcon
} from "./CustomIcons";
import ValetudoUser from "./ValetudoUser";

interface MenuEntry {
    kind: "MenuEntry";
    route: string;
    title: string;
    menuIcon: SvgIconComponent;
    menuText: string;
    requiredCapabilities?: {
        capabilities: Capability[];
        type: "allof" | "anyof"
    };
    requiredGroup?: "admin" | "user";
}

interface MenuSubEntry {
    kind: "MenuSubEntry",
    route: string,
    title: string,
    parentRoute: string
    requiredGroup?: "admin" | "user";
}

interface MenuSubheader {
    kind: "Subheader";
    title: string;
    requiredGroup?: "admin" | "user";
}



//Note that order is important here
const menuTree: Array<MenuEntry | MenuSubEntry | MenuSubheader> = [
    {
        kind: "MenuEntry",
        route: "/",
        title: "Home",
        menuIcon: HomeIcon,
        menuText: "Home"
    },
    {
        kind: "Subheader",
        title: "Robot"
    },
    {
        kind: "MenuEntry",
        route: "/robot/consumables",
        title: "Consumables",
        menuIcon: PendingActionsIcon,
        menuText: "Consumables",
        requiredCapabilities: {
            capabilities: [Capability.ConsumableMonitoring],
            type: "allof"
        }
    },
    {
        kind: "MenuEntry",
        route: "/robot/manual_control",
        title: "Manual control",
        menuIcon: SettingsRemoteIcon,
        menuText: "Manual control",
        requiredCapabilities: {
            capabilities: [Capability.ManualControl],
            type: "allof"
        }
    },
    {
        kind: "MenuEntry",
        route: "/robot/total_statistics",
        title: "Statistics",
        menuIcon: StatisticsIcon,
        menuText: "Statistics",
        requiredCapabilities: {
            capabilities: [Capability.TotalStatistics],
            type: "allof"
        }
    },
    {
        kind: "Subheader",
        title: "Options",
        requiredGroup: "admin"
    },
    {
        kind: "MenuEntry",
        route: "/options/map_management",
        title: "Map Options",
        menuIcon: MapManagementIcon,
        menuText: "Map",
        requiredCapabilities: {
            capabilities: [
                Capability.PersistentMapControl,
                Capability.MappingPass,
                Capability.MapReset,

                Capability.MapSegmentEdit,
                Capability.MapSegmentRename,

                Capability.CombinedVirtualRestrictions
            ],
            type: "anyof"
        },
        requiredGroup: "admin"
    },
    {
        kind: "MenuSubEntry",
        route: "/options/map_management/segments",
        title: "Segment Management",
        parentRoute: "/options/map_management",
        requiredGroup: "admin"
    },
    {
        kind: "MenuSubEntry",
        route: "/options/map_management/virtual_restrictions",
        title: "Virtual Restriction Management",
        parentRoute: "/options/map_management",
        requiredGroup: "admin"
    },
    {
        kind: "MenuSubEntry",
        route: "/options/map_management/robot_coverage",
        title: "Robot Coverage Map",
        parentRoute: "/options/map_management",
        requiredGroup: "admin"
    },
    {
        kind: "MenuEntry",
        route: "/options/connectivity",
        title: "Connectivity Options",
        menuIcon: ConnectivityIcon,
        menuText: "Connectivity",
        requiredGroup: "admin"
    },
    {
        kind: "MenuSubEntry",
        route: "/options/connectivity/auth",
        title: "Auth Settings",
        parentRoute: "/options/connectivity",
        requiredGroup: "admin"
    },
    {
        kind: "MenuSubEntry",
        route: "/options/connectivity/mqtt",
        title: "MQTT Connectivity",
        parentRoute: "/options/connectivity",
        requiredGroup: "admin"
    },
    {
        kind: "MenuSubEntry",
        route: "/options/connectivity/networkadvertisement",
        title: "Network Advertisement",
        parentRoute: "/options/connectivity",
        requiredGroup: "admin"
    },
    {
        kind: "MenuSubEntry",
        route: "/options/connectivity/ntp",
        title: "NTP Connectivity",
        parentRoute: "/options/connectivity",
        requiredGroup: "admin"
    },
    {
        kind: "MenuSubEntry",
        route: "/options/connectivity/wifi",
        title: "Wi-Fi Connectivity",
        parentRoute: "/options/connectivity",
        requiredGroup: "admin"
    },
    {
        kind: "MenuEntry",
        route: "/options/robot",
        title: "Robot Options",
        menuIcon: RobotMonochromeIcon,
        menuText: "Robot",
        requiredGroup: "admin"
    },
    {
        kind: "MenuSubEntry",
        route: "/options/robot/misc",
        title: "Misc Options",
        parentRoute: "/options/robot",
        requiredGroup: "admin"
    },
    {
        kind: "MenuSubEntry",
        route: "/options/robot/quirks",
        title: "Quirks",
        parentRoute: "/options/robot",
        requiredGroup: "admin"
    },
    {
        kind: "MenuEntry",
        route: "/options/valetudo",
        title: "Valetudo Options",
        menuIcon: ValetudoMonochromeIcon,
        menuText: "Valetudo",
        requiredGroup: "admin"
    },
    {
        kind: "Subheader",
        title: "Misc",
        requiredGroup: "admin"
    },
    {
        kind: "MenuEntry",
        route: "/valetudo/timers",
        title: "Timers",
        menuIcon: TimeIcon,
        menuText: "Timers",
        requiredGroup: "admin"
    },
    {
        kind: "MenuEntry",
        route: "/valetudo/log",
        title: "Log",
        menuIcon: LogIcon,
        menuText: "Log",
        requiredGroup: "admin"
    },
    {
        kind: "MenuEntry",
        route: "/valetudo/updater",
        title: "Updater",
        menuIcon: UpdaterIcon,
        menuText: "Updater",
        requiredGroup: "admin"
    },
    {
        kind: "MenuEntry",
        route: "/valetudo/system_information",
        title: "System Information",
        menuIcon: SystemInformationIcon,
        menuText: "System Information",
        requiredGroup: "admin"
    },
    {
        kind: "MenuEntry",
        route: "/valetudo/help",
        title: "General Help",
        menuIcon: HelpIcon,
        menuText: "General Help",
        requiredGroup: "admin"
    },
    {
        kind: "MenuEntry",
        route: "/valetudo/about",
        title: "About Valetudo",
        menuIcon: AboutIcon,
        menuText: "About Valetudo",
        requiredGroup: "admin"
    },
];



const ValetudoAppBar: React.FunctionComponent<{ paletteMode: PaletteMode, setPaletteMode: (newMode: PaletteMode) => void }> = ({
    paletteMode,
    setPaletteMode
}): React.ReactElement => {
    const [drawerOpen, setDrawerOpen] = React.useState<boolean>(false);
    const currentLocation = useLocation()?.pathname;
    const robotCapabilities = useCapabilitiesSupported(...Object.values(Capability));

    const {
        data: userProfileData,
        isPending: userProfilePending,
        isError: userProfileError,
    } = useValetudoUserProfileQuery();

    const groups = React.useMemo(() => {
        if (!userProfilePending) {
            if (userProfileError) {
                return {
                    roles: []
                };
            }
        }
        return {
            roles: userProfileData?.roles ?? []
        };
    }, [userProfileData, userProfileError, userProfilePending]);

    //@ts-ignore
    const currentMenuEntry = menuTree.find(element => element.route === currentLocation) ?? menuTree[0];

    const pageTitle = React.useMemo(() => {
        let ret = "";

        menuTree.forEach((element) => {
            //@ts-ignore
            if (currentLocation.includes(element.route) && element.route !== "/" && element.title) {
                if (ret !== "") {
                    ret += " - ";
                }

                ret += element.title;
            }
        });

        if (ret !== "") {
            document.title = `Valetudo - ${ret}`;
        } else {
            document.title = "Valetudo";
        }

        return currentMenuEntry.title;
    }, [currentLocation, currentMenuEntry]);

    const drawerContent = React.useMemo(() => {
        return (
            <Box
                sx={{width: 250}}
                role="presentation"
                onClick={() => {
                    setDrawerOpen(false);
                }}
                onKeyDown={() => {
                    setDrawerOpen(false);
                }}
                style={{
                    scrollbarWidth: "thin",
                    overflowX: "hidden"
                }}
            >
                <List>
                    {menuTree.filter(item => {
                        return item.kind !== "MenuSubEntry";
                    }).map((value, idx) => {
                        switch (value.kind) {
                            case "Subheader": {
                                if (value.requiredGroup !== undefined && !groups.roles.includes(value.requiredGroup)) {
                                    return null;
                                }
                                return (
                                    <ListSubheader
                                        key={`${idx}`}
                                        sx={{background: "transparent"}}
                                        disableSticky={true}
                                    >
                                        {value.title}
                                    </ListSubheader>
                                );
                            }

                            case "MenuEntry": {
                                if (value.requiredGroup !== undefined && !groups.roles.includes(value.requiredGroup)) {
                                    return null;
                                }
                                if (value.requiredCapabilities) {
                                    switch (value.requiredCapabilities.type) {
                                        case "allof": {
                                            if (!value.requiredCapabilities.capabilities.every(capability => {
                                                const idx = Object.values(Capability).indexOf(capability);
                                                return robotCapabilities[idx];
                                            })) {
                                                return null;
                                            }

                                            break;
                                        }
                                        case "anyof": {
                                            if (!value.requiredCapabilities.capabilities.some(capability => {
                                                const idx = Object.values(Capability).indexOf(capability);
                                                return robotCapabilities[idx];
                                            })) {
                                                return null;
                                            }

                                            break;
                                        }
                                    }
                                }

                                const ItemIcon = value.menuIcon;

                                return (
                                    <ListItemButton
                                        key={value.route}
                                        selected={value.route === currentLocation}
                                        component={Link}
                                        to={value.route}
                                    >
                                        <ListItemIcon>
                                            <ItemIcon/>
                                        </ListItemIcon>
                                        <ListItemText primary={value.menuText}/>
                                    </ListItemButton>
                                );
                            }
                        }
                    })}

                    <Divider/>
                    <ListItem>
                        <ListItemIcon>
                            <DarkModeIcon/>
                        </ListItemIcon>
                        <ListItemText primary="Dark mode"/>
                        <Switch
                            edge="end"
                            onChange={(e) => {
                                setPaletteMode(e.target.checked ? "dark" : "light");
                            }}
                            checked={paletteMode === "dark"}
                        />
                    </ListItem>


                    <ListSubheader
                        sx={{background: "transparent"}}>
                        Links
                    </ListSubheader>
                    <ListItemButton
                        component="a"
                        href="./swagger/"
                        target="_blank"
                        rel="noopener"
                    >
                        <ListItemIcon>
                            <SwaggerUIIcon/>
                        </ListItemIcon>
                        <ListItemText primary="Swagger UI"/>
                    </ListItemButton>
                    <Divider/>
                    <ListItemButton
                        component="a"
                        href="https://valetudo.cloud"
                        target="_blank"
                        rel="noopener"
                    >
                        <ListItemIcon>
                            <DocsIcon/>
                        </ListItemIcon>
                        <ListItemText primary="Docs"/>
                    </ListItemButton>
                    <ListItemButton
                        component="a"
                        href="https://github.com/Hypfer/Valetudo"
                        target="_blank"
                        rel="noopener"
                    >
                        <ListItemIcon>
                            <GithubIcon/>
                        </ListItemIcon>
                        <ListItemText primary="Hypfer/Valetudo"/>
                    </ListItemButton>
                    <ListItemButton
                        component="a"
                        href="https://github.com/sponsors/Hypfer"
                        target="_blank"
                        rel="noopener"
                    >
                        <ListItemIcon>
                            <DonateIcon/>
                        </ListItemIcon>
                        <ListItemText primary="Donate"/>
                    </ListItemButton>


                </List>
            </Box>
        );
    }, [paletteMode, groups.roles, currentLocation, robotCapabilities, setPaletteMode]);

    const toolbarContent = React.useMemo(() => {
        switch (currentMenuEntry.kind) {
            case "MenuEntry":
                return (
                    <>
                        <IconButton
                            size="large"
                            edge="start"
                            color="inherit"
                            aria-label="menu"
                            sx={{mr: 2}}
                            onClick={() => {
                                setDrawerOpen(true);
                            }}
                            title="Menu"
                        >
                            <MenuIcon/>
                        </IconButton>
                        <Typography variant="h6" component="div" sx={{flexGrow: 1}}>
                            {pageTitle}
                        </Typography>
                    </>
                );
            case "MenuSubEntry":
                return (
                    <>
                        <IconButton
                            size="large"
                            edge="start"
                            color="inherit"
                            aria-label="back"
                            sx={{mr: 2}}

                            component={Link}
                            to={currentMenuEntry.parentRoute}
                        >
                            <BackIcon/>
                        </IconButton>
                        <Typography variant="h6" component="div" sx={{flexGrow: 1}}>
                            {pageTitle}
                        </Typography>
                    </>
                );
            case "Subheader":
                //This can never happen
                return (<></>);
        }
    }, [currentMenuEntry, setDrawerOpen, pageTitle]);

    return (
        <Box
            sx={{
                userSelect: "none"
            }}
        >
            <AppBar position="fixed">
                <Toolbar>
                    {toolbarContent}
                    <div>
                        <ValetudoEvents/>
                        <ValetudoUser/>
                    </div>
                </Toolbar>
            </AppBar>
            <Toolbar/>
            {
                currentMenuEntry.kind !== "MenuSubEntry" &&
                <Drawer
                    anchor={"left"}
                    open={drawerOpen}
                    onClose={() => {
                        setDrawerOpen(false);
                    }}
                >
                    {drawerContent}
                </Drawer>
            }
        </Box>
    );
};

export default ValetudoAppBar;
