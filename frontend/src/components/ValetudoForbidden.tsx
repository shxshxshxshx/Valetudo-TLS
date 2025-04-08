import {ReactComponent as SplashLogo} from "../assets/icons/valetudo_splash.svg";
import {Alert, Grid2} from "@mui/material";
import React from "react";

const ValetudoSplash = (): React.ReactElement => {

    return (
        <Grid2
            container
            sx={{
                width: "90%",
                height: "50%",
                margin: "auto",
                marginTop: "25%",
                marginBottom: "25%",
                maxWidth: "600px",
                minHeight: "90%",
            }}
            direction="column"
            alignItems="center"
            justifyContent="center"
        >
            <Grid2>
                <SplashLogo
                    style={{
                        width: "90%",
                        marginLeft: "5%"
                    }}
                />
            </Grid2>
            <Grid2
                sx={{marginTop: "3em"}}
            >
                <Alert variant="filled" severity="error">
                    403 Forbidden
                </Alert>
            </Grid2>
        </Grid2>
    );
};

export default ValetudoSplash;
