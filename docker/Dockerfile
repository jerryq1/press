FROM mdd-images.tencentcloudcr.com/ops/nginx:1.24.0

ARG PROJ_DIR=/data/tvbcserver/mdd

WORKDIR $PROJ_DIR

COPY --chown=tvbcserver:tvbcserver ./public/ .